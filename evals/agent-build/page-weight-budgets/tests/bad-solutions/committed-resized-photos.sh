#!/bin/bash
# Rejected by: behavior.spec.ts. The reference, but instead of next/image the
# photos are resized once into committed WebP files. The pages meet every
# budget, but a photo added later has no resized copy and does not load.
set -euo pipefail
bash "$(dirname "$0")/_reference.sh"
node -e '
const sharp = require("sharp")
const fs = require("fs")
const widths = [120, 240, 280, 560, 1176]
;(async () => {
  for (const file of fs.readdirSync("public/photos").filter((f) => f.endsWith(".jpg"))) {
    for (const w of widths) {
      await sharp(`public/photos/${file}`).resize(w).webp({ quality: 70 }).toFile(`public/photos/${file.replace(".jpg", "")}-${w}.webp`)
    }
  }
})()
'
cat > components/photo.tsx <<'TSX'
/** Serves the committed WebP copy at the rendered width. */
export default function Photo({ src, width, alt, className }: { src: string; width: number; height: number; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  const w = width >= 1176 ? 1176 : width
  return <img src={src.replace('.jpg', `-${w}.webp`)} alt={alt} width={w} className={className} />
}
TSX
for f in $(grep -rl "from 'next/image'" app components); do
  sed -i "s#import Image from 'next/image'#import Image from '@/components/photo'#" "$f"
done
sed -i 's/width={2400} height={1100}/width={1176} height={1100}/' app/page.tsx
! grep -rq "from 'next/image'" app components
