globalThis.unavailableCatalog = {
  init(scope) {
    globalThis.fallbackShareScope = scope
  },
  get(request) {
    if (request === './async') {
      return async () => {
        globalThis.asyncFactoryCalls = (globalThis.asyncFactoryCalls || 0) + 1
        return { message: 'async factory result' }
      }
    }
    throw new Error(`Unavailable expose ${request}`)
  },
}
