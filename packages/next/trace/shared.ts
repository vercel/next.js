export type SpanId = number

export const traceGlobals: Map<any, any> = new Map()
export const setGlobal = (key: any, val: any) => {
  traceGlobals.set(key, val)
}
