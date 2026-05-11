# SPEC: Add structured error logging to all engines and search routes

**Worktree**: wt-search
**Priority**: P0 (silent engine failures = invisible outages for client)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/search/008-engine-error-logging.summary.md`

## Problem

`darkmon.py` and `fti.py` have **zero logging** — no `import logging`, no logger. Every exception is silently swallowed with `except Exception: return []` or `except: pass`. A complete DB outage looks identical to "no results found". `search_v2.py` and `stream.py` swallow thread-level timeouts and crashes with zero logging too.

There are 20+ bare except blocks across these files. When the client says "nothing is showing up", we have no way to tell if it's a real empty result or a broken connection.

## Changes

### File: `backend/app/engines/darkmon.py`

**Step 1 — Add logger at the top of the file**

After the existing imports, add:
```python
import logging

log = logging.getLogger("engine.darkmon")
```

**Step 2 — Replace every bare except block with structured logging**

There are ~8 bare except blocks. For each one, replace:

```python
# BEFORE (pattern appears ~8 times):
except Exception:
    return []    # or pass, or return {}, or return None
```

With:

```python
# AFTER:
except Exception:
    log.exception("<function_name> failed")
    return []    # keep the same fallback return
```

Use `log.exception(...)` — it automatically includes the traceback. The message should name the function for fast grep. Specific replacements:

| Line | Function | Log message |
|------|----------|-------------|
| ~42 | `_safe_query` | `"_safe_query failed: collection=%s", collection_name` |
| ~169 | `search_by_username` (author enrichment) | `"author profile enrichment failed: username=%s", username` |
| ~202 | `search_drug_vendors` | `"search_drug_vendors failed"` |
| ~231 | `get_drug_stats` | `"get_drug_stats aggregation failed"` |
| ~257 | `search_dread` (threads) | `"dread thread search failed: query=%s", query` |
| ~272 | `search_dread` (comments) | `"dread comment search failed: query=%s", query` |
| ~284 | `get_wallet_info` | `"get_wallet_info failed: address=%s", wallet_address` |
| ~299 | `get_wallet_transactions` | `"get_wallet_transactions failed: address=%s", wallet_address` |

### File: `backend/app/engines/fti.py`

**Step 1 — Add logger**

```python
import logging

log = logging.getLogger("engine.fti")
```

**Step 2 — Replace every bare except block**

Same pattern. ~7 bare except blocks:

| Line | Function | Log message |
|------|----------|-------------|
| ~23 | `_safe_fti_query` | `"_safe_fti_query failed: db=%s col=%s", db_name, col_name` |
| ~67 | `search_telegram_mentions` | `"search_telegram_mentions aggregation failed: phone=%s", phone` |
| ~90 | `get_telegram_group_details` | `"get_telegram_group_details failed: phone=%s", phone` |
| ~144 | `screen_crimedata` | `"screen_crimedata failed: name=%s", name` |
| ~171 | `screen_worldcheck` | `"screen_worldcheck failed: name=%s", name` |
| ~221 | `search_telegram_messages` | `"search_telegram_messages failed: query=%s", query` |

**IMPORTANT for screen_crimedata and screen_worldcheck**: These are watchlist/sanctions screening functions. A silent failure here is a **compliance risk** — the function returns `[]` which looks like "clean screening" when it's actually "query failed". Log at ERROR level explicitly:

```python
except Exception:
    log.error("screen_crimedata FAILED — returning empty, NOT a clean screen: name=%s", name, exc_info=True)
    return []
```

### File: `backend/app/engines/credmon.py`

**Check and fix**: credmon.py already has some logging. Verify that `fetch_record_by_id` (around line 179-185) where the ObjectId fallback happens has a log. If not, add:

```python
except Exception:
    log.debug("ObjectId parse failed for record_id=%s, trying raw string", record_id)
    return leaks_db[collection_name].find_one({"_id": record_id})
```

This one is LOW severity — the fallback is intentional. Use `log.debug`, not `log.error`.

### File: `backend/app/routes/search_v2.py`

**Fix the thread result swallowing** (around lines 484-502). Replace the bare except blocks:

```python
# FTI thread result (~line 484):
except Exception:
    log.error("FTI/financial thread failed or timed out", exc_info=True)
    fti_result = { ... }  # keep existing fallback

# DARKMON thread result (~line 496):
except Exception:
    log.error("DARKMON thread failed or timed out", exc_info=True)
    dm_result = { ... }  # keep existing fallback
```

Also fix the per-username darkmon swallow (~line 452-455):
```python
except Exception:
    log.warning("darkmon search_by_username failed: uname=%s", uname, exc_info=True)
    uh = {"threads": [], "posts": [], "author_profile": None}
```

Ensure `import logging` and `log = logging.getLogger("search_v2")` exist at the top.

### File: `backend/app/routes/stream.py`

**Fix the thread result swallowing** (around lines 147 and 155):

```python
# FTI result (~line 147):
except Exception:
    log.error("FTI thread failed or timed out in stream", exc_info=True)
    yield {"event": "threat_intel", "data": _dumps({})}

# DARKMON result (~line 155):
except Exception:
    log.error("DARKMON thread failed or timed out in stream", exc_info=True)
    yield {"event": "darkweb", "data": _dumps({...})}
```

Ensure `log = logging.getLogger("stream")` exists.

## Must NOT touch

- `backend/app/audit.py` — owned by wt-billing
- `backend/app/credits.py` — owned by wt-billing
- `backend/app/config.py` — owned by wt-infra
- `backend/app/main.py` — owned by wt-infra
- `frontend/src/*` — no frontend changes

## Acceptance criteria

1. `darkmon.py` has `import logging` and `log = logging.getLogger("engine.darkmon")`
2. `fti.py` has `import logging` and `log = logging.getLogger("engine.fti")`
3. Every `except Exception` block in darkmon.py (8 blocks) has a `log.exception()` or `log.error()` call
4. Every `except Exception` block in fti.py (7 blocks) has a `log.exception()` or `log.error()` call
5. `screen_crimedata` and `screen_worldcheck` log at ERROR level with a message explicitly stating it's NOT a clean screen
6. `search_v2.py` thread result blocks (FTI and DARKMON) log at ERROR level
7. `stream.py` thread result blocks log at ERROR level
8. No bare `except: pass` or `except Exception: return []` without logging remains in any of these files
9. `cd backend && python -c "from app.main import app"` succeeds (no import errors)

## Report back

Write summary to the path in "Summary output" above.
