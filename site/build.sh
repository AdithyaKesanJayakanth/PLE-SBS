#!/usr/bin/env bash
# Package the simulator as a self-contained static site served under /ple-sbs/.
#   ./site/build.sh   -> site/dist/ple-sbs/...  (deploy site/dist as a Vercel project)
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=site/dist
rm -rf "$OUT"
mkdir -p "$OUT/ple-sbs"
D="$OUT/ple-sbs"

cp web/app.js web/style.css "$D/"
cp sim/core.js "$D/core.js"
cp paper/PLE-SBS.pdf "$D/PLE-SBS.pdf"
cp data/scale_model.csv "$D/scale_model.csv"
pandoc docs/scale-model-protocol.md --standalone --metadata title="PLE-SBS scale-model test protocol" \
  -c style-doc.css -o "$D/scale-model-protocol.html"
cat > "$D/style-doc.css" <<'EOF'
body { max-width: 46rem; margin: 2rem auto; padding: 0 16px; font: 16px/1.55 "Helvetica Neue", Arial, sans-serif; color: #18283a; background: #f2f4f6; }
table { border-collapse: collapse; } th, td { border-bottom: 1px solid #c8d0d8; padding: 4px 10px 4px 0; text-align: left; }
code, pre { background: #e1e6eb; border-radius: 3px; } pre { padding: 8px; overflow-x: auto; }
@media (prefers-color-scheme: dark) { body { background: #131a22; color: #e3e9ef; } code, pre { background: #26313c; } th, td { border-color: #34414e; } }
EOF

# rewrite repo-relative links for the flat bundle
sed -e 's|\.\./sim/core\.js|core.js|' \
    -e 's|\.\./paper/PLE-SBS\.pdf|PLE-SBS.pdf|' \
    -e 's|\.\./data/scale_model\.csv|scale_model.csv|' \
    -e 's|\.\./docs/scale-model-protocol\.md|scale-model-protocol.html|' \
    web/index.html > "$D/index.html"

cat > "$OUT/vercel.json" <<'EOF'
{
  "cleanUrls": false,
  "trailingSlash": true,
  "redirects": [
    { "source": "/", "destination": "/ple-sbs/", "permanent": false }
  ],
  "headers": [
    { "source": "/ple-sbs/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
    ] }
  ]
}
EOF

grep -n '\.\./' "$D/index.html" && { echo "ERROR: unresolved ../ link in bundle" >&2; exit 1; } || true
echo "Bundle ready: $D ($(du -sh "$D" | cut -f1))"
