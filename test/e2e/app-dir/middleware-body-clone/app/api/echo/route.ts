export async function POST(request: Request) {
  // Yield once before reading, as a handler that does any async work would.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const reader = request.body!.getReader()
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
  }
  return Response.json({
    total,
    middleware: request.headers.get('x-from-middleware'),
  })
}
