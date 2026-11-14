import { setTimeout } from 'node:timers/promises'

export async function GET() {
  await setTimeout(20)
  return Response.json({ message: 'Uncached IO' })
}
