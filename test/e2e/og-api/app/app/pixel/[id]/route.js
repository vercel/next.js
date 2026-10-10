const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8mN6QAAAABJRU5ErkJggg==',
  'base64'
)

export async function GET() {
  return new Response(pixel, {
    headers: {
      'Content-Type': 'image/png',
    },
  })
}
