const { dep1 } = require('./commonjs-module')
import { dep2 } from './ecmascript-module'

if (dep1 && dep2) {
  console.log(dep1)
  console.log(dep2)
}
