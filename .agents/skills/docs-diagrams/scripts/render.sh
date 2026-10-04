#!/usr/bin/env bash
# Render every diagram defined in gen.mjs to light/<name>.png and dark/<name>.png at 2x.
#
# Usage: copy gen.mjs and this script into a scratch folder, edit the `diagrams`
# map in gen.mjs, then run ./render.sh from that folder.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
cd "$(dirname "$0")"

rm -f ./*.html light/*.png dark/*.png
node gen.mjs

for svg in light/*.svg; do
  name="$(basename "$svg" .svg)"
  height="$(node -e "const s=require('fs').readFileSync('$svg','utf8');console.log(/height=\"(\d+)\"/.exec(s)[1])")"
  for theme in light dark; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=2 \
      --window-size="1200,$height" \
      --virtual-time-budget=4000 \
      --screenshot="$PWD/$theme/$name.png" \
      "file://$PWD/$name-$theme.html" 2>/dev/null
    echo "rendered $theme/$name.png (2400x$((height * 2)))"
  done
done
