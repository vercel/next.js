let calls: number = 0

export const dynamic = 'force-dynamic'

export async function GET() {
  if (calls++ < 1) {
    throw new Error('Random error')
  }

  return new Response('Hello, world!')
}
