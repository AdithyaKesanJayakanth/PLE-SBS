#!/usr/bin/env bash
# Rebuild everything the paper depends on, then the PDF and the editable DOCX.
#   ./paper/build.sh            full rebuild (results, figures, PDF, DOCX)
#   ./paper/build.sh --quick    skip re-running the simulations
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
MAX_PAGES=7

if [[ "${1:-}" != "--quick" ]]; then
  node --test test/*.test.js
  node sim/export.js
  .venv/bin/python figures/make_figures.py
fi

cd paper
pandoc paper.md --standalone --template=template.html --mathml --section-divs -o paper.html
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 \
  --print-to-pdf="$PWD/PLE-SBS.pdf" "file://$PWD/paper.html" 2>/dev/null
pandoc paper.md --resource-path=. -o PLE-SBS.docx

pages=$(pdfinfo PLE-SBS.pdf | awk '/^Pages:/ {print $2}')
echo "PLE-SBS.pdf: $pages pages; PLE-SBS.docx written"
if (( pages > MAX_PAGES )); then
  echo "ERROR: paper is $pages pages; the limit is $MAX_PAGES" >&2
  exit 1
fi
