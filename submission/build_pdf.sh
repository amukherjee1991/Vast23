#!/usr/bin/env bash
# Rebuild submission/VAST2023-Signal-Hoist.pdf from REPORT.md and MC1–MC3.md.
# Needs the repo's .venv (python-markdown) and app/node_modules (Playwright + Chrome).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python
[ -x "$PY" ] || PY=python3
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
"$PY" submission/build_pdf.py "$TMP/report.html"
HTML="$TMP/report.html" OUT="$PWD/submission/VAST2023-Signal-Hoist.pdf" node --input-type=module -e '
import { createRequire } from "node:module"
const require = createRequire(process.cwd() + "/app/package.json")
const { chromium } = require("playwright")
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage()
await page.goto("file://" + process.env.HTML, { waitUntil: "networkidle" })
await page.evaluate(() => document.fonts.ready)
await page.pdf({
  path: process.env.OUT, format: "A4", printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: "<div style=\"width:100%;font:8px Helvetica,Arial,sans-serif;color:#6b7b89;padding:0 17mm;display:flex;justify-content:space-between\"><span>Signal Hoist · VAST Challenge 2023</span><span><span class=\"pageNumber\"></span> / <span class=\"totalPages\"></span></span></div>",
})
await browser.close()
console.log("wrote", process.env.OUT)
'
pdfinfo submission/VAST2023-Signal-Hoist.pdf 2>/dev/null | grep -E "Pages|File size" || true
