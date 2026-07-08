import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.upgrade({
    open(peer) {
      peer.subscribe('room')
      peer.send('ready')
    },
    message(peer, message) {
      if (message.text() === 'publish') {
        peer.publish('room', `broadcast:${peer.namespace}`)
        peer.send('published')
      } else {
        peer.send(message.text())
      }
    },
  })
}
