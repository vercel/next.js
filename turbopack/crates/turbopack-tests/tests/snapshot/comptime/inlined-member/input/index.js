// No module should be imported just to provide the replaced object's value.
console.log(POLYFILLED_GLOBAL.inlined)
console.log(POLYFILLED_GLOBAL['inlined'])
console.log(typeof POLYFILLED_GLOBAL.inlined)
console.log(POLYFILLED_GLOBAL.inlined === 'inlined' ? 'yes' : 'no')
console.log(UNKNOWN[POLYFILLED_GLOBAL.inlined])
