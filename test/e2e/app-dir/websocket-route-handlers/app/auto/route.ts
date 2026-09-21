import { NextResponse } from 'next/server'

let executions = 0

export function GET() {
  executions++
  const execution = executions

  return NextResponse.upgrade({
    open(peer) {
      peer.send(`auto:${execution}`)
    },
  })
}
