globalThis.__ws2ResetPromise = (globalThis.__ws2ResetPromise || 0) + 1
module.exports = Promise.resolve('promise-' + globalThis.__ws2ResetPromise)
