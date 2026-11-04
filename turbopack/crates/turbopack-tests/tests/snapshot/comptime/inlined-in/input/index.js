// The replaced membership checks must not import the object being checked.
console.log('inlined' in POLYFILLED_GLOBAL)
console.log('NODE_ENV' in process.env)
console.log('cache' in require)
