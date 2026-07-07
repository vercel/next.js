export async function GET() {
  // Uncached I/O — resolves at request time, so it can't be written to a
  // static file at build time.
  await new Promise((resolve) => setTimeout(resolve, 50))
  return Response.json({ value: 'io' })
}
