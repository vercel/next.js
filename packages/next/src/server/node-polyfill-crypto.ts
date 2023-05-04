// Polyfill crypto() in the Node.js environment

if (!(global as any).crypto) {
  function getCryptoImpl() {
    return require('node:crypto').webcrypto
  }
  Object.defineProperty(global, 'crypto', {
    get() {
      return getCryptoImpl()
    },
  })
}
