import { NativePromise } from './async-context'
import type { ClientPayload } from './protocol'

/** A real RPC result uses the current authored constructor, like the RPC peer. */
export async function callClientRpc<T>(
  start: (
    complete: (value: T | PromiseLike<T>) => void,
    fail: (error: unknown) => void,
    sent: () => void
  ) => void
): Promise<T> {
  let capturedResolve!: (value: T | PromiseLike<T>) => void
  let capturedReject!: (error: unknown) => void
  const result = new Promise<T>((resolve, reject) => {
    capturedResolve = resolve
    capturedReject = reject
  })
  // Match the RPC peer's data snapshot after the constructor returns.
  const resolveResult = capturedResolve
  const rejectResult = capturedReject
  let resolveSent!: () => void
  let rejectSent!: (error: unknown) => void
  const sent = new NativePromise<void>((resolve, reject) => {
    resolveSent = resolve
    rejectSent = reject
  })
  let started = false
  const fail = (error: unknown) => {
    if (started) rejectResult(error)
    else rejectSent(error)
  }
  async function handler() {
    try {
      start(resolveResult, fail, () => {
        started = true
        resolveSent()
      })
    } catch (error) {
      fail(error)
    }
    await sent
    return result
  }
  await handler()
  return result
}

/** Capture the real reply kind before serialization exposes nested payloads. */
export function hasVoidClientRpcReply(message: ClientPayload): boolean {
  switch (message.type) {
    case 'output':
    case 'collected':
    case 'case-start':
    case 'case-end':
    case 'case-final':
    case 'task-update':
    case 'suite-end':
    case 'failure':
    case 'complete':
      return true
    case 'browser-command':
      switch (message.command.method) {
        case 'keyboardCleanup':
        case 'wheel':
        case 'tab':
        case 'dragAndDrop':
        case 'click':
        case 'dblClick':
        case 'tripleClick':
        case 'unhover':
        case 'hover':
        case 'fill':
        case 'clear':
        case 'selectOptions':
        case 'upload':
          return true
      }
  }
  return false
}

/** Decode only the captured transport void sentinel before the RPC resolver. */
export function decodeClientRpcValue(
  voidReply: boolean,
  value: unknown
): unknown {
  return voidReply && value === null ? undefined : value
}
