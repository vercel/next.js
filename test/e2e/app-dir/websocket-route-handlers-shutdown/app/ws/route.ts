import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  if (process.env.NEXT_TEST_MANUAL_UPGRADE_OWNER === '1') {
    console.log('[manual-upgrade-owner] Next.js route raced')
  }
  return NextResponse.upgrade({
    open(peer) {
      peer.send('ready')
    },
    async close() {
      if (process.env.NEXT_TEST_STUCK_WEBSOCKET_CLOSE === '1') {
        console.log('[websocket-close-hook] started and stuck')
        await new Promise<void>(() => {})
      }
      await new Promise<void>((resolve) => setImmediate(resolve))
      console.log('[websocket-close-hook] finished')
    },
  })
}
