import { register } from './registry.js'

globalThis.evaluationOrder.push('holder')

__turbopack_emit__('./entry.js', {
  namespace: 'evaluation-order-reentrant-collected-import',
})
const getList = __turbopack_collect__({
  namespace: 'evaluation-order-reentrant-collected-import',
})

// The `import()` function of a collected module evaluates the module synchronously.
register('entry', () => getList()[0].import())
