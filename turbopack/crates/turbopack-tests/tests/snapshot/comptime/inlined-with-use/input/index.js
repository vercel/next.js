// Replacing one expression must not suppress a separate surviving reference.
console.log(POLYFILLED_GLOBAL.inlined)
console.log('inlined' in POLYFILLED_GLOBAL)
console.log(typeof POLYFILLED_GLOBAL.typed)
console.log(POLYFILLED_GLOBAL.other)
console.log(typeof POLYFILLED_GLOBAL.other)
console.log('other' in POLYFILLED_GLOBAL)
console.log(import.meta.url)
console.log(typeof import.meta.url)
console.log(UNKNOWN[POLYFILLED_GLOBAL.other])

// Assignments are not replacements: the object reference must survive.
POLYFILLED_GLOBAL.inlined = 'assigned'
