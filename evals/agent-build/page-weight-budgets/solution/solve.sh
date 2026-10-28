#!/bin/bash
# Reference: next/image with real sizes everywhere; Server Components for
# pages and cards with small client islands that receive only what they use;
# one shared star symbol; only the icons the site uses; the review toggle and
# catalog filter take server-rendered children instead of product records.
set -euo pipefail
SOLUTION_DIR=${SOLUTION_DIR:-/solution}
rm -f components/product-view.tsx
cp -R "$SOLUTION_DIR/files/." .
# formatPrice moved to lib/format.ts so client islands do not import the catalog.
sed -i "s#^export const formatPrice = .*##" lib/catalog.ts
