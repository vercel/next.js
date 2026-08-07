import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  console.log('[slow-websocket-upgrade] started')
  const gate = (
    globalThis as typeof globalThis & {
      [key: symbol]: Promise<void> | undefined
    }
  )[Symbol.for('next.test.websocket-route-handlers-shutdown.slow-gate')]
  if (!gate) {
    throw new Error('Invariant: slow WebSocket upgrade gate was not installed.')
  }
  await gate
  console.log('[slow-websocket-upgrade] finished')

  return NextResponse.upgrade({
    open() {
      console.log('[slow-websocket-upgrade] opened')
    },
  })
}
