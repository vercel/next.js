import './entry.js'

globalThis.evaluationOrder.push('above')

// The direct `eval` keeps this module from being merged, so `entry.js` does not inherit its
// merge group.
eval('0')
