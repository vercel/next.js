globalThis.releaseSetupPromiseState =
  (globalThis.releaseSetupPromiseState || 0) + 1
module.exports = new Promise(() => {})
