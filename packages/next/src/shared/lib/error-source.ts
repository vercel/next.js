const symbolError = Symbol.for('NextjsError')

export function getErrorSource(error: Error): 'server' | 'edge-server' | null {
  return (error as any)[symbolError] || null
}

export type ErrorSourceType = 'edge-server' | 'server'

export function decorateServerError(error: Error, type: ErrorSourceType) {
  Object.defineProperty(error, symbolError, {
    writable: false,
    enumerable: false,
    configurable: false,
    value: type,
  })
}
