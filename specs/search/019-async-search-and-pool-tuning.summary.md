# Spec 019 — Async search orchestration + Mongo pool tuning — DONE

## Changes applied

### 1. `backend/app/db.py`
- Changed `maxPoolSize=10` to `maxPoolSize=50` in `_connect()`.
- 50 connections per engine x 3 engines = 150 max connections total, sufficient for 20 concurrent analysts.

### 2. `backend/app/routes/search_v2.py`
- Added `import asyncio` at top.
- Converted `event_generator` from sync generator to `async def` (async generator).
- Moved `_run_fti_and_financial` and `_run_darkmon` out of the `event_generator` closure to module-level functions. They now accept parameters (`engines`, `all_results`, `seeds_dicts`) instead of closing over generator locals.
- BFS call wrapped in `asyncio.to_thread(_run_bfs)`: collects all results in a sync function, awaits it, then yields results one by one.
- FTI+DARKMON parallel block wrapped in `asyncio.to_thread(_run_parallel)`: the ThreadPoolExecutor still runs inside but the await releases the uvicorn worker back to the event loop.
- All credit handling, audit logging, summary generation, and error handling logic unchanged.

### 3. `backend/app/main.py`
- Added `_warm_caches()` function that spawns a daemon thread to call `_build_stats()` from the stats module.
- Called `_warm_caches()` in the `lifespan` function after `audit.start()`.

## Validation

All three files pass `python3 -c "import ast; ast.parse(open('FILE').read())"`:
- `app/db.py` — OK
- `app/routes/search_v2.py` — OK
- `app/main.py` — OK

## No other files modified
