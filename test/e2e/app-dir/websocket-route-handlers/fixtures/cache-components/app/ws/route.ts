import { NextResponse } from 'next/server'

let executions = 0
let releaseProspectiveRender: (() => void) | undefined

export async function GET() {
  executions++

  if (process.env.NEXT_PHASE === 'phase-production-build') {
    if (executions === 1) {
      await new Promise<void>((resolve) => {
        releaseProspectiveRender = resolve
      })
    } else {
      releaseProspectiveRender?.()
    }
  }

  return NextResponse.upgrade({
    open(peer) {
      peer.send('cache-components')
    },
  })
}
