import { setImmediate } from 'node:timers/promises'

export async function GET() {
  await setImmediate()
  throw new Error('handler failed after an immediate')
}
