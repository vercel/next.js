Array.of(() => {
  globalThis.deferredCallback = 'not executed'
})

new Array(() => {
  globalThis.deferredCallback = 'not executed'
})
;[1].map(() => () => {
  globalThis.deferredCallback = 'not executed'
})
