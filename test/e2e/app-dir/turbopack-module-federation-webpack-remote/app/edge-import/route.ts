export const runtime = 'edge'

export async function GET() {
  // @ts-expect-error -- intentionally verifies the Edge diagnostic
  const remote = await import('catalog/message')
  return Response.json({ message: remote.message })
}
