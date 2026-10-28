#!/bin/bash
# Rejected by: behavior.spec.ts. Meets the budgets by leaving out the reviews
# behind "Show all reviews".
set -euo pipefail
bash "$(dirname "$0")/_reference.sh"
node -e '
const fs=require("fs");const f="app/products/[slug]/page.tsx";let s=fs.readFileSync(f,"utf8");
s=s.replace(/          <MoreReviews[\s\S]*?<\/MoreReviews>\n/, "");
s=s.replace("import { MoreReviews } from \x27@/components/more-reviews\x27\n","");
fs.writeFileSync(f,s)'
! grep -q MoreReviews 'app/products/[slug]/page.tsx'
