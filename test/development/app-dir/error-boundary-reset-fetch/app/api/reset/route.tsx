let run: boolean = false

export const dynamic = 'force-dynamic'

export async function GET() {
  if (run === false) {
    run = true
    throw new Error('Random error')
  }

  return new Response('Hello, world!')
}
