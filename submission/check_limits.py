#!/usr/bin/env python3
"""Count words and images per answer in the VAST answer sheets against the
official limits. Words exclude the quoted question and image markup but
include figure captions. Exit status 1 if any answer is over a limit.

    python3 submission/check_limits.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIMITS = {  # question: (words, images); images None = no images requested
    "MC1": {1: (600, 6), 2: (400, 4), 3: (600, 6), 4: (300, None)},
    "MC2": {1: (600, 6), 2: (600, 6), 3: (300, 4), 4: (300, 4), 5: (300, None)},
    "MC3": {1: (400, 5), 2: (400, 5), 3: (400, 4), 4: (600, 6), 5: (300, None)},
}


def words(text: str) -> int:
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`>|#]", " ", text)
    return sum(1 for w in text.split() if re.search(r"\w", w))


over = False
print(f"{'answer':<8}{'body':>6}{'captions':>10}{'total':>7}{'limit':>7}{'images':>8}")
for mc, qs in LIMITS.items():
    sheet = (HERE / f"{mc}.md").read_text(encoding="utf-8")
    parts = re.split(r"^### Question (\d)\s*$", sheet, flags=re.M)
    for i in range(1, len(parts), 2):
        q, body = int(parts[i]), parts[i + 1]
        lines = [l for l in body.splitlines() if not l.startswith("> ")]
        caps = [l for l in lines if l.startswith("*Figure")]
        rest = [l for l in lines if not l.startswith("*Figure")]
        wb, wc = words("\n".join(rest)), words("\n".join(caps))
        imgs = len(re.findall(r"!\[", body))
        lw, li = qs[q]
        bad = wb + wc > lw or imgs > (li or 0)
        over |= bad
        print(f"{mc} Q{q:<4}{wb:>6}{wc:>10}{wb + wc:>7}{lw:>7}{imgs:>4}/{li or 0:<3}{'  OVER' if bad else ''}")
sys.exit(1 if over else 0)
