import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.upgrade({
    open(peer) {
      peer.send('host')
    },
    message(peer, message) {
      peer.send(`host:${message.text()}`)
    },
  })
}
