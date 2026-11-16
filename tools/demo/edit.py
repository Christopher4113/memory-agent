"""Cuts the Memory Audit take into the finished demo: a title card, the take (intro through results),
an end card, subtitles from the captions, and one GIF of the contradiction-to-history part for the README.

    reshoot edit tools/demo/edit.py takes/memory-audit.mp4

Writes memory-audit-final.mp4, memory-audit-final.srt and memory-audit.gif next to the take.
"""
import sys, tempfile
from pathlib import Path

from reshoot import cut

# The words on screen
TITLE = "Memory Audit"
TAGLINE = "Finds contradictions, stale facts, duplicates, scope leaks and secrets"
TAGLINE2 = "in the Markdown memory a team of agents shares"
END_TITLE = "Memory Audit"
END_LINE = "TypeScript, Effect, Hono, Postgres, React. Demo data is made up."
END_SMALL = "Independent prototype, not affiliated with The Company Company."
BG, INK, MUTED = (250, 250, 249), (11, 11, 10), (90, 90, 88)  # the app's own palette
W, H = 2160, 1350  # the take is 1440x900 at 1.5x


def main(web):
    web = Path(web)
    b = cut.beats(web)
    out = web.parent
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        title = (
            cut.Card(W, H, BG)
            .text(None, 470, TITLE, 150, 700, INK)
            .text(None, 690, TAGLINE, 46, 500, MUTED)
            .text(None, 760, TAGLINE2, 46, 500, MUTED)
            .save(t / "title.png")
        )
        end = (
            cut.Card(W, H, BG)
            .text(None, 500, END_TITLE, 120, 700, INK)
            .text(None, 680, END_LINE, 44, 500, MUTED)
            .text(None, 760, END_SMALL, 34, 500, MUTED)
            .save(t / "end.png")
        )
        parts = [
            cut.still(title, 3, t / "title.mp4"),
            cut.trim(web, b["intro"], b["end"], t / "web.mp4", fade_in=0.3, fade_out=0.4),
            cut.still(end, 3, t / "end.mp4"),
        ]
        final = out / "memory-audit-final.mp4"
        cut.concat(parts, final)
        cut.write_srt(cut.cues(web, b["intro"], b["end"], 3), out / "memory-audit-final.srt")
    cut.gif(web, b["contradiction"], b["history"], out / "memory-audit.gif", fps=12, width=1080)
    for f in ("memory-audit-final.mp4", "memory-audit-final.srt", "memory-audit.gif"):
        p = out / f
        print(f"  {p}" + (f"  {cut.duration(p):5.1f}s" if not f.endswith(".srt") else ""))


if __name__ == "__main__":
    main(*sys.argv[1:])
