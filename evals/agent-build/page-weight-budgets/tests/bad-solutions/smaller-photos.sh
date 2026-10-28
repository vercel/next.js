#!/bin/bash
# Rejected by: behavior.spec.ts. Meets the image budget by shrinking the product
# photos on the page.
set -euo pipefail
bash "$(dirname "$0")/_reference.sh"
node -e '
  const fs = require("fs")
  const file = "app/globals.css"
  const src = fs.readFileSync(file, "utf8")
  const out = src.replace(/(\.card-photo \{\s*width: )280px;(\s*height: )280px;/, "$1200px;$2200px;")
  if (out === src) throw new Error("card photo rule not found")
  fs.writeFileSync(file, out)
'
