import { NextResponse } from 'next/server'

const version = 'beta-v0'

export function GET() {
  return NextResponse.upgrade({
    open(peer) {
      peer.send(version)
    },
    message(peer, message) {
      peer.send(`${version}:${message.text()}`)
    },
  })
}
