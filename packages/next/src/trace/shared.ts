import { randomBytes } from 'node:crypto'

let _traceGlobals: Map<any, any> = (global as any)._traceGlobals

if (!_traceGlobals) {
  _traceGlobals = new Map()
}
;(global as any)._traceGlobals = _traceGlobals

export const traceGlobals: Map<any, any> = _traceGlobals
export const setGlobal = (key: any, val: any) => {
  traceGlobals.set(key, val)
}

export const traceId =
  process.env.TRACE_ID ||
  process.env.NEXT_PRIVATE_TRACE_ID ||
  randomBytes(8).toString('hex')
