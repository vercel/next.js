// A discarded require becomes `0` when its target is side-effect free.
function bareRequires() {
  require('./defineprop.js')
  require('./assign.js')
  require('./barrel.js')
  require('./defineprop-foreign.js')
  return 'kept'
}

function isBundled(file) {
  return Array.from(__turbopack_modules__.keys()).some((id) =>
    id.includes(`/input/${file} `)
  )
}

it('removes discarded requires of side-effect-free modules', () => {
  expect(bareRequires()).toBe('kept')

  // Defining properties on `exports` (including the `__esModule` marker and
  // transpiled reexports) is not a side effect.
  const code = bareRequires.toString()
  expect(code).not.toContain('defineprop.js')
  expect(code).not.toContain('assign.js')
  expect(code).not.toContain('barrel.js')
  expect(isBundled('defineprop.js')).toBe(false)
  expect(isBundled('assign.js')).toBe(false)
  expect(isBundled('barrel.js')).toBe(false)
  expect(isBundled('barrel-target.js')).toBe(false)
})

it('keeps a discarded require of a module defining properties on a foreign object', () => {
  // A foreign target is observable, so this require is kept.
  expect(bareRequires.toString()).toContain('defineprop-foreign.js')
  expect(globalThis.x).toBe(1)
})
