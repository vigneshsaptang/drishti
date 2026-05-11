# Spec Protocol

You are receiving a spec from the orchestrator session. Follow these rules exactly.

## Execution rules

1. **Read the full spec** before making any changes
2. **Only touch files listed in the "Changes" section** — nothing else
3. **Do NOT touch files listed in "Must NOT touch"**
4. **If you need a change in a hot file** (main.py, config.py, App.jsx, lib/api.js), do NOT edit it. Instead, note it in the HANDOFF section of your summary
5. **Follow the acceptance criteria** — test each one and report pass/fail
6. **Write your summary** to the path specified in the spec's "Summary output" field

## Summary format

Write your summary as:

```markdown
# Summary: [spec title]

## Status: DONE | PARTIAL | BLOCKED

## Changes made
- `path/to/file.py`: [what changed, in one line]
- `path/to/other.py`: [what changed]

## Acceptance criteria
- [x] criteria 1 — passed
- [ ] criteria 2 — failed: [reason]

## HANDOFF items (for orchestrator to apply)
### config.py
- [change needed]

### lib/api.js
- [change needed]

## Notes
[anything unexpected, decisions made, risks]
```

## If something is unclear

Ask the user before proceeding. Do not guess at architectural decisions — the orchestrator session makes those.
