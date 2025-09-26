// Polyfill crypto() in the Node.js environment

if (!global.crypto) {
  let webcrypto: Crypto | undefined

  Object.defineProperty(global, 'crypto', {
    enumerable: false,
    configurable: true,
    get() {
      if (!webcrypto) {
        // @ts-expect-error -- TODO: Is this actually safe?
        webcrypto = (require('node:crypto') as typeof import('node:crypto'))
          .webcrypto
      }
      return webcrypto
    },
    set(value: Crypto) {
      webcrypto = value
    },
  })
}
