// Expected to fail: values that a module imports and (re)exports are constants too, but they
// aren't inlined yet.
import { IMPORTED_EXPORTED, REEXPORTED, USING_IMPORTED_EXPORTED } from './other'

function importedExported() {
  if (IMPORTED_EXPORTED === 'imported exported') {
    return IMPORTED_EXPORTED
  } else {
    return require('./dead-code')
  }
}

function reexported() {
  if (REEXPORTED === 'reexported') {
    return REEXPORTED
  } else {
    return require('./dead-code')
  }
}

function usingImportedExported() {
  if (USING_IMPORTED_EXPORTED === 'ximported exported') {
    return USING_IMPORTED_EXPORTED
  } else {
    return require('./dead-code')
  }
}

it('inlines an imported value that is exported', () => {
  expect(importedExported()).toBe('imported exported')

  const code = importedExported.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "imported exported"')
  expect(code).not.toContain('dead-code')
})

it('inlines a reexported value', () => {
  expect(reexported()).toBe('reexported')

  const code = reexported.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "reexported"')
  expect(code).not.toContain('dead-code')
})

it('inlines a value computed from an imported value', () => {
  expect(usingImportedExported()).toBe('ximported exported')

  const code = usingImportedExported.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "ximported exported"')
  expect(code).not.toContain('dead-code')
})
