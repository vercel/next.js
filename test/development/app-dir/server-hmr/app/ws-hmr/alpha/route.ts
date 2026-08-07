import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const version = 'alpha-v0'

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
