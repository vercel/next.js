// import otherImported from './other.js'
// console.log('3 index', otherImported)

// import { x } from './x.js'
const { x } = require('./x.js')
import { y } from './y.js'
import { z } from './z.js'
console.log('4 index', x, y, z)

it('works', () => {})
