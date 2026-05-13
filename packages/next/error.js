module.exports = require('./dist/pages/_error')

// Keep the catch-error graph lazy so default Error consumers do not load it.
Object.defineProperty(module.exports, 'unstable_catchError', {
  enumerable: true,
  get() {
    return require('./dist/client/components/catch-error').unstable_catchError
  },
})
