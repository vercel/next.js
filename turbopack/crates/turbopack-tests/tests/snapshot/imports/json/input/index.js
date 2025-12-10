import pkg from './package.json'
console.log(pkg.name)

import huge from './huge.json'
console.log(huge)

import invalid from './invalid.json'
console.log(invalid['this-is'])
