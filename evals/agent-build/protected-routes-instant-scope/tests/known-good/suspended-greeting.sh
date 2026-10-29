#!/bin/bash
# Known-good: a reviewed passing solution from calibration, recorded as the
# files it changed (formatted with the repository's Prettier config) and the
# files it deleted.
set -euo pipefail
dir="$(dirname "$0")/suspended-greeting"
cp -R "$dir/files/." .
while read -r file; do [ -n "$file" ] && rm -f "$file"; done < "$dir/deleted.txt"
