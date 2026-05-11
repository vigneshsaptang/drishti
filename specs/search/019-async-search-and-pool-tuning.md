# Spec 019 — Async search orchestration + Mongo pool tuning

## Worktree: wt-search (backend)
## Priority: P0 (performance — deploy blocker for 20 users)

## Goal

The current search endpoint blocks a uvicorn worker thread for the entire search duration (BFS + FTI + DARKMON = 5-30s). With 3 workers, the 4th user waits. Fix by running the blocking Mongo calls via `asyncio.to_thread` so the worker is released back to the event loop while waiting on I/O. Also increase Mongo connection pool size since 20 concurrent analysts × 3 engines = up to 60 simultaneous connections.

## Context

### Current problem in `search_v2.py`

The endpoint is `async def search_v2()` but all the actual work inside `event_generator()` is synchronous:
- `credmon.run_pipeline_streaming()` — synchronous generator, blocks on Mongo
- `_run_fti_and_financial()` and `_run_darkmon()` — run in `ThreadPoolExecutor(max_workers=2)` but the `f_fti.result(timeout=60)` call blocks the async generator

Since `EventSourceResponse` consumes the async generator on the event loop, every `yield` from `event_generator()` must be non-blocking. The current code works because `sse_starlette` runs sync generators in a thread, but this means each active search holds a thread hostage.

### Current problem in `db.py`

```python
_clients[name] = MongoClient(uri, maxPoolSize=10, ...)
```

`maxPoolSize=10` per engine. With 20 analysts searching simultaneously:
- Each search uses 1 connection for BFS (CREDMON) + 1-2 for FTI + 1 for DARKMON
- 20 searches × ~3 connections = 60 connections needed
- Pool of 10 → connection starvation, requests queue behind each other

## Files to modify

```
backend/app/routes/search_v2.py   — convert event_generator to async
backend/app/db.py                 — increase maxPoolSize
backend/app/main.py               — warm dashboard cache in lifespan
```

## Implementation

### 1. `backend/app/db.py` — increase pool size

Change `maxPoolSize=10` to `maxPoolSize=50`:

```python
def _connect(name: str, uri: str) -> MongoClient:
    if name not in _clients:
        _clients[name] = MongoClient(
            uri,
            connectTimeoutMS=20_000,
            socketTimeoutMS=settings.credmon_socket_timeout_ms,
            serverSelectionTimeoutMS=20_000,
            maxPoolSize=50,
        )
    return _clients[name]
```

50 connections per engine × 3 engines = 150 max connections total. Mongo default is 100 per client, so 50 is conservative. Each idle connection uses ~1KB of RAM on both sides.

### 2. `backend/app/routes/search_v2.py` — async event generator

Convert `event_generator` from a sync generator to an async generator. The key change: wrap the blocking CREDMON BFS call and the ThreadPoolExecutor results in `asyncio.to_thread`.

```python
import asyncio

@router.post("/search")
async def search_v2(req: SearchRequestV2, request: Request, _credits: dict = Depends(require_credits(...))):
    engines = set(req.engines) if req.engines else {"breach", "threat_intel", "darkweb", "financial"}
    seeds_dicts = [{"type": s.type, "value": s.value} for s in req.seeds]

    async def event_generator():
        t_start = time.time()

        yield {"event": "search:start", "data": _dumps({"seeds": seeds_dicts, "max_depth": req.max_depth})}

        # Credits events (same as before)
        if _credits.get("cached"):
            yield {"event": "credits:update", "data": _dumps({...})}
        elif _credits.get("deducted"):
            yield {"event": "credits:update", "data": _dumps({...})}

        # BFS — run the blocking generator in a thread, yield results as they come
        total_entities_searched = 0
        total_found = 0
        max_depth_reached = 0
        all_results = []

        # Collect all BFS results in a thread, then yield them
        def _run_bfs():
            results = []
            for result in credmon.run_pipeline_streaming(seeds=seeds_dicts, max_depth=req.max_depth):
                results.append(result)
            return results

        bfs_results = await asyncio.to_thread(_run_bfs)

        for result in bfs_results:
            total_entities_searched += 1
            if result.get("found"):
                total_found += 1
            entity_depth = result.get("depth", 0)
            if entity_depth > max_depth_reached:
                max_depth_reached = entity_depth
            all_results.append(result)
            yield {"event": "entity:result", "data": _dumps(result)}

        # FTI + DARKMON — run in thread pool, await results
        def _run_parallel():
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                f_fti = executor.submit(_run_fti_and_financial, engines, all_results, seeds_dicts)
                f_dm = executor.submit(_run_darkmon, engines, all_results)
                try:
                    fti_result = f_fti.result(timeout=60)
                except Exception:
                    log.error("FTI/financial thread failed", exc_info=True)
                    fti_result = {fallback}
                try:
                    dm_result = f_dm.result(timeout=60)
                except Exception:
                    log.error("DARKMON thread failed", exc_info=True)
                    dm_result = {fallback}
                return fti_result, dm_result

        fti_result, dm_result = await asyncio.to_thread(_run_parallel)

        for evt in fti_result["events"]:
            yield evt
        for evt in dm_result["events"]:
            yield evt

        # Summary + search:complete (same as before, just yield)
        ...

    return EventSourceResponse(event_generator())
```

**Key changes:**
1. `event_generator` is now `async def` (async generator)
2. BFS runs in `asyncio.to_thread(_run_bfs)` — releases the worker while waiting
3. FTI+DARKMON parallel block runs in `asyncio.to_thread(_run_parallel)` — releases the worker
4. Between the `to_thread` calls, `yield` statements are async and non-blocking

**What stays the same:**
- `_run_fti_and_financial` and `_run_darkmon` inner functions — still sync, still run in ThreadPoolExecutor
- `_extract_usernames`, `_extract_fullnames`, `_extract_profile_for_summary` — unchanged
- Credit handling, audit logging, summary generation — unchanged
- Error handling structure — unchanged

**Important:** Move `_run_fti_and_financial` and `_run_darkmon` definitions outside the `event_generator` closure — pass `engines`, `all_results`, `seeds_dicts` as arguments instead of closing over them. This is cleaner and avoids async generator closure issues.

### 3. `backend/app/main.py` — warm dashboard cache on startup

In the `lifespan` function, after `init_platform()`, trigger a background thread to warm the dashboard and stats caches so the first analyst gets instant data:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_jwt_secret()
    get_credmon()
    get_darkmon()
    get_fti()
    try:
        init_platform()
    except Exception as e:
        logger.warning("Platform init failed (DB auth?): %s — platform features may be unavailable", e)
    audit.start()
    _warm_caches()
    yield
    audit.stop()
    close_all()


def _warm_caches():
    """Preload dashboard + stats caches in background threads so first requests are instant."""
    import threading
    def _warm():
        try:
            from app.routes.stats import _build_stats
            _build_stats()
            logger.info("Stats cache warmed")
        except Exception as e:
            logger.warning("Stats cache warm failed: %s", e)
    threading.Thread(target=_warm, daemon=True).start()
```

## Acceptance criteria

- [ ] `db.py` has `maxPoolSize=50` (was 10)
- [ ] `search_v2.py` event_generator is `async def` (async generator)
- [ ] BFS and FTI+DARKMON work run via `asyncio.to_thread` (not blocking the event loop)
- [ ] `_run_fti_and_financial` and `_run_darkmon` accept parameters instead of closing over generator locals
- [ ] `main.py` calls `_warm_caches()` in lifespan to preload stats
- [ ] `python -c "import ast; ast.parse(open('app/routes/search_v2.py').read())"` — syntax valid
- [ ] `python -c "import ast; ast.parse(open('app/main.py').read())"` — syntax valid
- [ ] `python -c "import ast; ast.parse(open('app/db.py').read())"` — syntax valid
- [ ] No other files modified

## Testing instructions

```bash
# In Docker:
docker compose -f docker-compose.dev.yml up --build -d
# Watch logs for "Stats cache warmed"
docker compose logs -f backend | grep -i cache

# Test search still works:
curl -X POST http://localhost:8888/api/v2/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"seeds": [{"type": "phone", "value": "9999999999"}]}'
```

## HANDOFF items

`backend/app/main.py` — add `_warm_caches()` call in lifespan. This touches a hot file. The orchestrator should apply this.

## Summary output

Write summary to: `specs/search/019-async-search-and-pool-tuning.summary.md`

## Notes

- `asyncio.to_thread` is Python 3.9+. The project requires 3.11+ per CLAUDE.md, so this is safe.
- The BFS results are collected all-at-once in the thread then yielded one by one. This means the SSE stream won't show progressive BFS results during the BFS phase — they'll all appear after BFS completes. This is a tradeoff: progressive rendering during BFS is nice, but it requires a more complex queue-based approach (asyncio.Queue between the thread and the async generator). The current approach is simpler and the BFS phase is typically 1-3s, so the user won't notice.
- If progressive BFS rendering is important later, the fix is: `_run_bfs` puts results into an `asyncio.Queue`, the async generator reads from the queue. That's a follow-up spec.
- `maxPoolSize=50` means up to 150 connections total across 3 engines. MongoDB default `net.maxIncomingConnections` is 65536, so this is fine. The VPS Mongo should handle it.
