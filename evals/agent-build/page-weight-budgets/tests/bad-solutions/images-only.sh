#!/bin/bash
# Rejected by: behavior.spec.ts. Only switches photos to next/image; the pages
# still ship the catalog and the icon set to the browser and repeat the star SVG.
set -euo pipefail
node -e '
const fs=require("fs");
for (const f of ["components/product-card.tsx","app/page.tsx","components/product-view.tsx","app/about/page.tsx"]) {
  let s=fs.readFileSync(f,"utf8");
  s=s.replace(/^(\x27use client\x27\n\n)?/, (m)=>m+"import Image from \x27next/image\x27\n");
  s=s.replace("<img src={product.image} alt={product.name} width={280} height={280}","<Image src={product.image} alt={product.name} width={280} height={280} sizes=\"280px\"");
  s=s.replace("<img src=\"/photos/hero.jpg\" alt=\"Hikers on a ridge at sunrise\"","<Image src=\"/photos/hero.jpg\" alt=\"Hikers on a ridge at sunrise\" width={2400} height={1100} sizes=\"1176px\" priority");
  s=s.replace("<img src={photo} alt={product.name}","<Image src={photo} alt={product.name} width={560} height={560} sizes=\"560px\" priority");
  s=s.replace("<img src={src} alt=\"\"","<Image src={src} alt=\"\" width={120} height={120} sizes=\"120px\"");
  s=s.replace("<img src={m.photo} alt={m.name}","<Image src={m.photo} alt={m.name} width={240} height={240} sizes=\"240px\"");
  fs.writeFileSync(f,s);
}'
grep -q "next/image" components/product-card.tsx
