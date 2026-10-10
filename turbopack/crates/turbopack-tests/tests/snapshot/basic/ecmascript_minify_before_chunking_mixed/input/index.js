import { esmValue } from './esm-mod'
const cjs = require('./cjs-mod')
console.log(esmValue, cjs.cjsValue)
