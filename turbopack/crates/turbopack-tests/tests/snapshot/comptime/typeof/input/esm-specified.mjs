console.log('typeof require', typeof require)
console.log('typeof import.meta', typeof import.meta)
// ESM, should be `undefined`
console.log('typeof module', typeof module)
console.log('typeof exports', typeof exports)

// ESM, should be require stub
console.log(require)
