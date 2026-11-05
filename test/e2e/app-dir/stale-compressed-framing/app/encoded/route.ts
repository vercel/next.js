export async function GET() {
  const body = new Response('encoded by the handler').body!.pipeThrough(
    new CompressionStream('gzip')
  )
  return new Response(body, {
    headers: { 'content-encoding': 'gzip' },
  })
}
