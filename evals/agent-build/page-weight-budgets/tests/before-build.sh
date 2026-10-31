#!/bin/bash
# The instruction says products and photos are added later. Add one product
# with three new photos, as the CMS export would, before the build.
set -euo pipefail
cp "$TESTS"/later/item-1{7,8,9}.jpg public/photos/
node -e '
const fs = require("fs")
const file = "lib/catalog.json"
const catalog = JSON.parse(fs.readFileSync(file, "utf8"))
catalog.push(JSON.parse(fs.readFileSync(process.argv[1], "utf8")))
fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n")
' "$TESTS/later/product.json"
