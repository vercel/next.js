globalThis.throwsOnceCounter ??= 0
globalThis.throwsOnceCounter++

if (globalThis.throwsOnceCounter === 1) {
  throw new Error('first evaluation')
}

module.exports = 'evaluated'
