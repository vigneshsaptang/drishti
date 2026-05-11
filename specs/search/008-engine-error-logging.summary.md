# Summary: Add structured error logging to all engines and search routes

## Status: DONE

## Changes made
- `backend/app/engines/darkmon.py`: Added `import logging` and `log = logging.getLogger("engine.darkmon")`. All 8 bare except blocks now have `log.exception()` calls with function name and key parameters.
- `backend/app/engines/fti.py`: Added `import logging` and `log = logging.getLogger("engine.fti")`. All 6 bare except blocks now have logging. `screen_crimedata` and `screen_worldcheck` use `log.error()` with explicit "NOT a clean screen" message and `exc_info=True`.
- `backend/app/engines/credmon.py`: Added `import logging` and `log = logging.getLogger("engine.credmon")`. `fetch_record_by_id` ObjectId fallback now has `log.debug()` (low severity — intentional fallback).
- `backend/app/routes/search_v2.py`: Already had `log = logging.getLogger("search_v2")`. Added `log.warning()` to per-username darkmon swallow, `log.error()` to FTI and DARKMON thread result blocks.
- `backend/app/routes/stream.py`: Added `import logging` and `log = logging.getLogger("stream")`. FTI and DARKMON thread result blocks now have `log.error()` with `exc_info=True`.

## Acceptance criteria
- [x] criteria 1 — `darkmon.py` has `import logging` and `log = logging.getLogger("engine.darkmon")`
- [x] criteria 2 — `fti.py` has `import logging` and `log = logging.getLogger("engine.fti")`
- [x] criteria 3 — Every `except Exception` block in darkmon.py (8 blocks) has a `log.exception()` call
- [x] criteria 4 — Every `except Exception` block in fti.py (6 blocks) has a `log.exception()` or `log.error()` call
- [x] criteria 5 — `screen_crimedata` and `screen_worldcheck` log at ERROR level with "NOT a clean screen" message
- [x] criteria 6 — `search_v2.py` thread result blocks (FTI and DARKMON) log at ERROR level
- [x] criteria 7 — `stream.py` thread result blocks log at ERROR level
- [x] criteria 8 — No bare `except: pass` or `except Exception: return []` without logging remains in any of these files — verified via grep
- [x] criteria 9 — `python -c "from app.main import app"` — SKIPPED: fails on local machine due to missing `jwt` module (pre-existing, runs in Docker only). All 5 files pass `ast.parse()` syntax check.

## HANDOFF items (for orchestrator to apply)
None — all changes in owned files.

## Notes
- The `from app.main import app` acceptance test fails locally because `PyJWT` is not installed outside Docker. This is a pre-existing environment issue unrelated to these changes. All 5 changed files pass Python `ast.parse()` syntax validation.
- fti.py spec listed 7 blocks but only 6 exist: `_safe_fti_query`, `search_telegram_mentions`, `get_telegram_group_details`, `screen_crimedata`, `screen_worldcheck`, `search_telegram_messages`. All 6 are now logged.
- Logger names follow the convention: `engine.darkmon`, `engine.fti`, `engine.credmon` for engines; `search_v2`, `stream` for routes.
