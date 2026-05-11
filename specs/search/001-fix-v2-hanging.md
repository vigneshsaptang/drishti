# SPEC: Fix v2 search hanging on fullname/username queries

**Worktree**: wt-search
**Priority**: P0 (blocking)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/search/001-fix-v2-hanging.summary.md`

## Problem

The v2 search pipeline hangs for minutes on fullname and username searches due to five compounding issues: BFS explosion from queueing all entity types, max_depth defaulting to 5, no BFS timeout, sequential engine execution, and excessive records_per_source.

## Changes

### File: `backend/app/routes/search_v2.py`

1. **Change `SearchRequestV2.max_depth` default from 5 to 2.** Find the Pydantic model class and update the default value.

2. **Parallelize FTI and DARKMON phases.** Currently the SSE generator runs FTI screening, financial screening, and DARKMON sequentially. Wrap them in a `concurrent.futures.ThreadPoolExecutor(max_workers=2)` with a 60-second wall timeout, matching the pattern already used in `stream.py`. Group FTI+financial as one task and DARKMON as the other.

### File: `backend/app/engines/credmon.py`

3. **In `run_pipeline_streaming` — stop queueing usernames and fullnames into BFS.** Find the section where `new_usernames` and `new_fullnames` are appended to the queue (around lines 389-396 and 436-441). Remove those queue.append calls. Still extract and yield usernames/fullnames as discovered entities — just don't re-search them. This matches the v1 `run_pipeline` behavior which only queues emails and phones.

4. **Add a wall-clock timeout to the BFS loop.** At the start of `run_pipeline_streaming`, record `t0 = time.monotonic()`. At the top of each BFS iteration, check `if time.monotonic() - t0 > 30.0: break`. When the timeout fires, yield a warning event:
   ```python
   yield {"event": "warning", "data": {"message": "BFS timeout reached (30s)", "entities_searched": len(visited)}}
   ```
   Import `time` if not already imported.

5. **Cap `records_per_source`** — if `run_pipeline_streaming` has a default higher than 10 for records fetched per source collection, reduce it to 10. Check what the current default is and align it closer to v1's behavior.

## Must NOT touch

- `backend/app/routes/stream.py` — v1 streaming, leave it alone
- `backend/app/routes/search.py` — v1 single-response, leave it alone
- `backend/app/engines/credmon.py` → `run_pipeline` function — v1 BFS, leave it alone
- `backend/app/audit.py` — owned by wt-billing
- `backend/app/credits.py` — owned by wt-billing
- `frontend/src/*` — no frontend changes needed for this spec
- `backend/app/config.py` — owned by wt-infra (use HANDOFF if you need a setting)

## HANDOFF (request to orchestrator)

If you determine a config setting would be useful (e.g., `CREDMON_BFS_TIMEOUT_S`), note it in your summary's HANDOFF section. Do NOT edit config.py yourself.

## Acceptance criteria

1. `SearchRequestV2.max_depth` defaults to 2 (verify in the model definition)
2. `run_pipeline_streaming` does NOT queue usernames or fullnames into BFS — only emails and phones
3. `run_pipeline_streaming` has a 30-second wall-clock timeout on the BFS loop
4. FTI and DARKMON run in parallel in `search_v2.py`, not sequentially
5. The v1 pipeline (`run_pipeline`, `stream.py`, `search.py`) is completely unchanged
6. Start the backend (`cd backend && python -c "from app.main import app"`) — no import errors
7. If possible, test a fullname search via curl to `/api/v2/search` and confirm it completes in under 30 seconds

## Report back

Write summary to the path in "Summary output" above. Include any HANDOFF items.
