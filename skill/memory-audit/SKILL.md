---
name: memory-audit
description: Audit the shared /memories filesystem for contradictions, stale facts, duplicates, scope leaks and secrets. Use when asked to review, clean up or health-check memory, or on a weekly schedule. Proposes fixes as a draft; never edits memory itself.
---

# Memory Audit

You are reviewing `/memories`, which many agents write to without review. Find memory rot and propose fixes for a human to approve.

## Hard rule

**Never edit, move or delete a memory file yourself.** Put every proposed change in a draft for a human to approve, the same way outward actions go through draft cards. If a secret is found, do not copy its value anywhere: show only the first 6 and last 4 characters.

## Scopes

- `company/` is read by everyone. `projects/<name>/`, `agents/<name>/` and `personal/<person>/` are narrower.
- When two scopes disagree, prefer the newest dated statement; if nothing is dated, prefer the higher scope (company > project > agent).

## Checks (run in this order, cheapest first)

1. **Secrets.** Look for API keys and tokens (`sk-`, `sk-ant-`, `ghp_`, `github_pat_`, `xoxb-`, `AKIA…`, `-----BEGIN … PRIVATE KEY-----`) and long random-looking strings. Severity high. Fix: replace the value with `<stored in workspace secrets>` and ask a human to rotate it.
2. **Duplicates.** The same statement, lightly reworded, in two or more non-personal files. Severity low. Fix: keep it in the highest scope; replace the others with `See <path>.`
3. **Scope leaks.** Anything from `personal/<person>/` (phone numbers, emails, medical, compensation, private plans) that also appears in a company, project or agent file, or any line in a shared file that is clearly personal about one individual. Work contact details for customers are fine. Severity high. Fix: remove the line from the shared file.
4. **Contradictions.** List the concrete facts in each file (dates, prices, owners, SLAs, statuses). Group facts about the same thing across files. Flag a group only if the statements cannot both be true now; dated history ("was $39, now $49") is not a contradiction. Severity high if a company file is involved, else medium. Fix: change the older or lower-scope line to match, and say which value you kept and why.
5. **Stale facts.** A line still worded as upcoming, pending, blocked or due whose date has passed, or a dated status that a newer dated line in another file supersedes. Severity medium. Fix: update to the newer status or mark it for confirmation.

Health score: 100 − 10 per high − 4 per medium − 1 per low, floor 0.

## Output

Post one draft with a summary line, then a Markdown table, highest severity first:

```
Memory health: 62/100 (2 high, 4 medium, 3 low) across 23 files.

| # | Check | Severity | Title | Evidence (file:lines) | Suggested fix |
|---|-------|----------|-------|------------------------|---------------|
| 1 | contradiction | high | Launch date differs: Dec 2 vs Dec 9 | company/overview.md:14; projects/launch-v2/status.md:6 | company/overview.md:14 `- v2 launch: Dec 2, 2026` → `- v2 launch: Dec 9, 2026` (newest dated value, Nov 12) |
```

Rules for the table:

- **Title** is one line a person can read without opening the files.
- **Evidence** cites every file involved with line numbers.
- **Suggested fix** is an exact before → after Markdown edit per file, or "remove line".
- Add a one or two sentence explanation under the table for anything that is not obvious.

## Limits

- If you are unsure whether something is a real conflict, list it under "Needs a human look" instead of the table.
- Do not report more than 25 findings in one draft; say how many more there are.
- Re-running on unchanged memory should produce the same findings.
