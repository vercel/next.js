// A discarded require becomes `0` when its target is side-effect free.
require('./defineprop.js')
require('./assign.js')
require('./barrel.js')
require('./defineprop-foreign.js')

console.log('kept')
