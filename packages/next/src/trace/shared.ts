let _traceGlobals: Map<any, any> = (global as any)._traceGlobals

if (!_traceGlobals) {
  _traceGlobals = new Map()
}
;(global as any)._traceGlobals = _traceGlobals

export const traceGlobals: Map<any, any> = _traceGlobals
export const setGlobal = (key: any, val: any) => {
  traceGlobals.set(key, val)
}
