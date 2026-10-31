#!/bin/bash
# Rejected by: behavior.spec.ts. The reference, but every star repeats the full
# path inline, so the catalog HTML is over budget.
set -euo pipefail
bash "$(dirname "$0")/_reference.sh"
node -e '
const fs=require("fs");const f="components/stars.tsx";let s=fs.readFileSync(f,"utf8");
s=s.replace("<svg key={i} width=\"14\" height=\"14\" fill=","<svg key={i} width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=");
s=s.replace("          <use href=\"#star\" />","          <path d={STAR_PATH} />");
fs.writeFileSync(f,s)'
grep -q "<path d={STAR_PATH} />" components/stars.tsx
