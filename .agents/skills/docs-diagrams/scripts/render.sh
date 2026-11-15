#!/usr/bin/env bash
# Render every diagram module in ./diagrams to light/<name>.png and dark/<name>.png at 2x.
#
# Usage: copy lib.mjs, gen.mjs, diagrams/ and this script into a scratch folder,
# add or edit a module in diagrams/, then run ./render.sh from that folder.
# Set CHROME=/path/to/chrome when Chrome is not installed at the default macOS path.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
cd "$(dirname "$0")"

rm -f ./*.html light/*.png dark/*.png light/*.svg dark/*.svg
node gen.mjs

for svg in light/*.svg; do
  name="$(basename "$svg" .svg)"
  height="$(node -e "const s=require('fs').readFileSync('$svg','utf8');console.log(/height=\"(\d+)\"/.exec(s)[1])")"
  width="$(node -e "const s=require('fs').readFileSync('$svg','utf8');console.log(/width=\"(\d+)\"/.exec(s)[1])")"
  for theme in light dark; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=2 \
      --window-size="$width,$height" \
      --virtual-time-budget=4000 \
      --screenshot="$PWD/$theme/$name.png" \
      "file://$PWD/$name-$theme.html" 2>/dev/null
    echo "rendered $theme/$name.png ($((width * 2))x$((height * 2)))"
  done
done
