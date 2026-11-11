import { setImmediate } from 'node:timers/promises'

export async function GET() {
  await setImmediate()
  return null as unknown as Response
}
