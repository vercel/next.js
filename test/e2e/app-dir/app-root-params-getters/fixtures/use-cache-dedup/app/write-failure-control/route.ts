import { connection } from 'next/server'
import writeFailureState from '../../write-failure-state'

export async function GET() {
  await connection()
  return Response.json({
    requestedLanguages: writeFailureState.requestedLanguages,
    generatedLanguages: writeFailureState.generatedLanguages,
    failedWriteLanguages: writeFailureState.failedWriteLanguages,
    writtenLanguages: writeFailureState.writtenLanguages,
  })
}

export async function POST(request: Request) {
  switch (await request.text()) {
    case 'hold-fill': {
      const id = new URL(request.url).searchParams.get('id')
      if (id === null) {
        return new Response(null, { status: 400 })
      }
      writeFailureState.id = id
      writeFailureState.requestedLanguages = []
      writeFailureState.generatedLanguages = []
      writeFailureState.failedWriteLanguages = []
      writeFailureState.writtenLanguages = []
      writeFailureState.pendingFill = new Promise((resolve) => {
        writeFailureState.releaseFill = resolve
      })
      break
    }
    case 'release-fill':
      writeFailureState.releaseFill?.()
      writeFailureState.releaseFill = null
      writeFailureState.pendingFill = null
      break
    default:
      return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 204 })
}
