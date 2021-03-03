export enum TARGET {
  CONSOLE = 'CONSOLE',
  ZIPKIN = 'ZIPKIN',
  TELEMETRY = 'TELEMETRY',
}

export type SpanId = string

export const traceGlobals: Map<any, any> = new Map()
export const setGlobal = (key, val) => {
  traceGlobals.set(key, val)
}
