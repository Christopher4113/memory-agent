# Demo video

A 40-second walkthrough recorded in headless Chrome with [reshoot](https://github.com/reshoot). It uses only the made-up Northwind fixture, in its own database (`memory_audit_demo`) on its own ports (web 5174, API 8788), so your normal runs are never touched.

## Record again

```
docker compose up -d
pnpm demo:serve                    # leave running (web :5174, API :8788)
sh tools/demo/seed.sh --copy-cache # first time only; later runs: pnpm demo:seed
reshoot web tools/demo/storyboard.toml takes/memory-audit.mp4
reshoot check takes/memory-audit.assets.json takes/memory-audit.mp4 --review takes/review --every 2
reshoot edit tools/demo/edit.py takes/memory-audit.mp4
```

Re-run `pnpm demo:seed` before every recording: the take expects exactly one run (Northwind week 1) in the demo database, so that "Run audit" creates run #2 and the comparison has something to compare.

`--copy-cache` copies the main database's LLM cache into the demo database, so the video shows the same findings as the README (14/14, 1 false positive). Without it, a cold run may differ: model output varies between runs.

## Files

- `storyboard.toml`: the beats, captions and the result each beat waits for.
- `seed.sh`: resets the demo database to one run.
- `edit.py`: title card, take, end card, subtitles, and a GIF of the contradiction-to-history part.
- Output goes to `takes/` (git-ignored): `memory-audit-final.mp4`, `memory-audit-final.srt`, `memory-audit.gif`, and the privacy review sheets in `takes/review/`.
