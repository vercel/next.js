export async function GET(request: Request) {
  if (!new URL(request.url).searchParams.has('load')) {
    return Response.json({ value: 'idle' })
  }

  const { value } = await import('./target')
  return Response.json({ value })
}
