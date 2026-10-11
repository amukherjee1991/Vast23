#!/usr/bin/env python3
"""Render REPORT.md and the three answer sheets into one print-ready HTML file.

Called by build_pdf.sh, which then prints the HTML to VAST2023-Signal-Hoist.pdf
with Playwright. Usage: build_pdf.py <out.html>
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
DOCS = ["REPORT.md", "MC1.md", "MC2.md", "MC3.md"]

CSS = """
@page { size: A4; margin: 18mm 17mm 20mm; }
:root { --ink: #0f1a24; --ink-2: #4a5b6a; --rule: #d7dee5; --plate: #07111b; --accent: #b3263f; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Archivo", system-ui, sans-serif; font-size: 10pt; line-height: 1.5; color: var(--ink); background: #fff; margin: 0; }
.doc + .doc { break-before: page; }
h1, h2, h3 { font-family: "Bodoni Moda", Georgia, serif; font-weight: 500; line-height: 1.15; break-after: avoid; }
h1 { font-size: 24pt; margin: 0 0 8pt; }
h2 { font-size: 16pt; margin: 20pt 0 6pt; padding-top: 6pt; border-top: 0.6pt solid var(--rule); }
h3 { font-size: 13pt; margin: 14pt 0 4pt; }
.doc > h2:first-of-type { border-top: 0; }
p, li { orphans: 3; widows: 3; }
a { color: var(--ink); text-decoration-color: #9fb0bf; }
code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 8.5pt; background: #eef2f5; padding: 0 2pt; border-radius: 2pt; }
blockquote { margin: 6pt 0 8pt; padding: 6pt 10pt; border-left: 2.5pt solid var(--accent); background: #f5f7f9; color: var(--ink-2); font-style: italic; break-inside: avoid; }
blockquote p { margin: 0; }
hr { border: 0; border-top: 0.6pt solid var(--rule); margin: 14pt 0; }
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; margin: 6pt 0 10pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border-bottom: 0.5pt solid var(--rule); padding: 3pt 5pt; text-align: left; vertical-align: top; }
th { font-weight: 600; border-bottom: 0.9pt solid var(--ink); }
/* figure plates: dark screenshots on a dark plate, caption below */
p.fig { break-inside: avoid; margin: 10pt 0 12pt; }
p.fig img { display: block; max-width: 100%; max-height: 150mm; margin: 0 auto; background: var(--plate); border: 5pt solid var(--plate); border-radius: 3pt; box-sizing: border-box; }
p.fig em { display: block; margin-top: 4pt; font-size: 8.5pt; color: var(--ink-2); }
"""


def render(name: str) -> str:
    text = (HERE / name).read_text(encoding="utf-8")
    html = markdown.markdown(text, extensions=["tables", "sane_lists"])
    # tag figure paragraphs (an image followed by its caption)
    return html.replace("<p><img ", '<p class="fig"><img ')


def shrink_images(html: str, out_dir: Path) -> str:
    """Re-encode each figure as a 1400 px wide JPEG for the PDF (macOS sips);
    the 2880 px WebP originals would make a very large PDF."""
    if not shutil.which("sips"):
        return html
    out_dir.mkdir(parents=True, exist_ok=True)

    def sub(m: re.Match) -> str:
        src = (HERE / m.group(1)).resolve()
        dst = out_dir / (src.stem + ".jpg")
        if not dst.exists():
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "74",
                            "--resampleWidth", "1400", str(src), "--out", str(dst)],
                           check=True, capture_output=True)
        return f'src="{dst.as_uri()}"'

    return re.sub(r'src="([^"]+\.(?:webp|png))"', sub, html)


def main() -> None:
    out = Path(sys.argv[1])
    docs = [d for d in DOCS if (HERE / d).exists()]
    missing = set(DOCS) - set(docs)
    if missing:
        print("warning: missing " + ", ".join(sorted(missing)), file=sys.stderr)
    body = "\n".join(f'<section class="doc">{render(d)}</section>' for d in docs)
    body = shrink_images(body, out.parent / "img")
    out.write_text(
        f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<base href="{HERE.as_uri()}/">
<title>Signal Hoist · VAST Challenge 2023</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,400..700;1,400..700&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>{body}</body></html>""",
        encoding="utf-8",
    )
    print(f"rendered {', '.join(docs)} -> {out}")


if __name__ == "__main__":
    main()
