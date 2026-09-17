import { writeFile } from 'node:fs/promises'

import { NextResponse, type WebSocketHooks } from 'next/server'

export function GET() {
  const hooks: WebSocketHooks = {
    open(peer) {
      peer.send('connected')
    },
    message(peer, message) {
      peer.send(message.rawData)
    },
    async close(_peer, details) {
      const receiptPath = process.env.WEBSOCKET_CLOSE_RECEIPT
      if (receiptPath) {
        await writeFile(receiptPath, JSON.stringify(details))
      }
    },
  }

  return NextResponse.upgrade(hooks)
}
