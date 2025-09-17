'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = require('path')
// See https://devblogs.microsoft.com/typescript/announcing-typescript-4-4/#more-compliant-indirect-calls-for-imported-functions
// Also https://2ality.com/2015/12/references.html
const file = (0, path_1.join)(__dirname, 'file.txt')
console.log(file)
