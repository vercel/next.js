// An ordinary SVG document, served with no trick prefix.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
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
