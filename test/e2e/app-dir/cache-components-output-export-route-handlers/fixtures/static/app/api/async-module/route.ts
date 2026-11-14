const message = await Promise.resolve('Async GET')

export function GET() {
  return Response.json({ message })
}
