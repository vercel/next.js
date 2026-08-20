// Service-worker-style entry: the whole transitive closure (including the
// dynamic `import()` targets) must be inlined into a single output file.
console.log('service worker entry')

import('./dep1').then(({ dep1 }) => {
  dep1()
})
