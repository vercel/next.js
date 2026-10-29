import { connection } from 'next/server'
import writeFailureState from '../../write-failure-state'

export async function GET() {
  await connection()
  return Response.json({
    requestedLanguages: writeFailureState.requestedLanguages,
    generatedLanguages: writeFailureState.generatedLanguages,
    failedWriteLanguages: writeFailureState.failedWriteLanguages,
    writtenLanguages: writeFailureState.writtenLanguages,
    startedWrites: writeFailureState.startedWrites,
    lookupKeys: writeFailureState.lookupKeys,
    initialLookupCount: writeFailureState.initialLookupCount,
    specificLookupCount: writeFailureState.specificLookupCount,
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
      writeFailureState.startedWrites = []
      writeFailureState.lookupKeys = []
      writeFailureState.failedWrite = 'both'
      writeFailureState.lookupHistory = false
      writeFailureState.pendingFill = new Promise((resolve) => {
        writeFailureState.releaseFill = resolve
      })
      break
    }
    case 'hold-lookup-history':
      writeFailureState.lookupHistory = true
      writeFailureState.failedWrite = null
      writeFailureState.heldWrite = 'value'
      writeFailureState.initialLookupKey = ''
      writeFailureState.initialLookupCount = 0
      writeFailureState.specificLookupCount = 0
      writeFailureState.pendingWrite = new Promise((resolve) => {
        writeFailureState.releaseWrite = resolve
      })
      writeFailureState.pendingSecondWrite = new Promise((resolve) => {
        writeFailureState.releaseSecondWrite = resolve
      })
      writeFailureState.pendingInitialLookup = new Promise((resolve) => {
        writeFailureState.releaseInitialLookup = resolve
      })
      writeFailureState.pendingSpecificLookup = new Promise((resolve) => {
        writeFailureState.releaseSpecificLookup = resolve
      })
      break
    case 'release-initial-lookup':
      writeFailureState.releaseInitialLookup?.()
      writeFailureState.pendingInitialLookup = null
      break
    case 'release-specific-lookup':
      writeFailureState.releaseSpecificLookup?.()
      writeFailureState.pendingSpecificLookup = null
      break
    case 'release-second-write':
      writeFailureState.releaseSecondWrite?.()
      writeFailureState.pendingSecondWrite = null
      break
    case 'hold-redirect-write':
    case 'hold-value-write': {
      const searchParams = new URL(request.url).searchParams
      writeFailureState.heldWrite =
        searchParams.get('held') === 'redirect' ? 'redirect' : 'value'
      const failure = searchParams.get('failure')
      writeFailureState.failedWrite =
        failure === 'redirect' || failure === 'value' ? failure : null
      writeFailureState.pendingWrite = new Promise((resolve) => {
        writeFailureState.releaseWrite = resolve
      })
      break
    }
    case 'release-write':
      writeFailureState.releaseWrite?.()
      writeFailureState.releaseWrite = null
      writeFailureState.pendingWrite = null
      writeFailureState.heldWrite = null
      break
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
