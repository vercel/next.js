// SharedWorkers use onconnect to handle incoming connections
let count = 0
self.addEventListener('connect', function (e: MessageEvent) {
  const port = e.ports[0]
  import('./worker-dep').then((mod) => {
    port.postMessage('shared-worker.ts:' + mod.default + ':' + ++count)
  })
})
