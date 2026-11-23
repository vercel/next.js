// A valid SVG document that begins with the HTML comment `<!--ftypavif-->`.
// The byte sequence "ftypavif" lands at byte offset 4, which is exactly where
// the optimizer's AVIF magic-byte signature looks for it.
const SVG = `<!--ftypavif-->
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect width="100" height="100" fill="red"/>
</svg>
`

export function GET() {
  return new Response(SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store',
    },
  })
}
