import('./worker-dep').then((mod) => {
  self.postMessage('worker.ts:' + mod.default)
})
