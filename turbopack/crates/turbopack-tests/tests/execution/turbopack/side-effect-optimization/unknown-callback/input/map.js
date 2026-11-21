const callback = () => {
  globalThis.unknownCallbackMap = 'executed'
}

;[1].map(callback)
