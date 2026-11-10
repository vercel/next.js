import { connection } from 'next/server'
import sharedWriteFailureState from '../../shared-write-failure-state'

export async function GET() {
  await connection()
  return Response.json({
    generatedValues: sharedWriteFailureState.generatedValues,
    writeStarted: sharedWriteFailureState.writeStarted,
    writeFailed: sharedWriteFailureState.writeFailed,
    joinerStarted: sharedWriteFailureState.joinerStarted,
    joinerReadCompleted: sharedWriteFailureState.joinerReadCompleted,
  })
}

export async function POST(request: Request) {
  switch (await request.text()) {
    case 'hold-write': {
      const id = new URL(request.url).searchParams.get('id')
      if (id === null) {
        return new Response(null, { status: 400 })
      }
      sharedWriteFailureState.id = id
      sharedWriteFailureState.generatedValues = []
      sharedWriteFailureState.writeStarted = false
      sharedWriteFailureState.writeFailed = false
      sharedWriteFailureState.joinerStarted = false
      sharedWriteFailureState.joinerReadCompleted = false
      sharedWriteFailureState.pendingWrite = new Promise((resolve) => {
        sharedWriteFailureState.releaseWrite = resolve
      })
      break
    }
    case 'release-write':
      sharedWriteFailureState.releaseWrite?.()
      sharedWriteFailureState.releaseWrite = null
      sharedWriteFailureState.pendingWrite = null
      break
    default:
      return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 204 })
}
