console.log('typeof require', typeof require)
console.log('typeof import.meta', typeof import.meta)
// CJS, should be `object`
console.log('typeof module', typeof module)
console.log('typeof exports', typeof exports)

// CJS, should be real require
console.log(require)
