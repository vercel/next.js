#!/bin/bash
# Rejected by: behavior.spec.ts. The reference, but the client components still
# import the whole icon set, so every page ships it.
set -euo pipefail
bash "$(dirname "$0")/_reference.sh"
git checkout -- components/icon.tsx
node -e 'const fs=require("fs");const f="components/icon.tsx";fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace("export function Icon({ name, size = 20, label }: { name: string;","export function Icon({ name, size = 20, label }: { name: string;"))'
