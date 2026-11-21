const executor = (resolve) => {
  globalThis.unknownCallbackPromise = 'executed'
  resolve()
}

new Promise(executor)
