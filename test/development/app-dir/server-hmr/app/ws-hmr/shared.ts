import { NextResponse } from 'next/server'

const version = 'shared-v0'

export function upgrade(name: string) {
  return NextResponse.upgrade({
    open(peer) {
      peer.send(`${name}:${version}`)
    },
  })
}
