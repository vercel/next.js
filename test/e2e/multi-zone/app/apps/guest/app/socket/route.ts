import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.upgrade({
    open(peer) {
      peer.send('guest')
    },
    message(peer, message) {
      peer.send(`guest:${message.text()}`)
    },
  })
}
