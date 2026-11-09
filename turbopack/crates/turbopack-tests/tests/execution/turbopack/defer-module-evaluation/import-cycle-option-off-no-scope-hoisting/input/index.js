import './setup.js'

// In each directory, the first import of `entry.js` is a module without side effects that the
// entry only reads in a function, and that module is the first one to import an import cycle. One
// module of the cycle reads another one while it is evaluated, so the cycle only works when it is
// entered where that first importer enters it. A later import of the entry reaches the cycle at
// another module. With `deferModuleEvaluation`, the module that imports the cycle is still
// evaluated before the entry, so the cycle is entered at the same module as without the option
// (the `import-cycle-option-off` fixtures have the same input). `crossModuleConstants` is off, as
// in a Next.js build: it would inline `DEFAULT_LOCALE` and remove the read.

function evaluated(directory) {
  return globalThis.deferEvents
    .filter((event) => event.startsWith(directory + ':'))
    .map((event) => event.slice(directory.length + 1))
}

const expected = { formatted: 'x:de,en', supported: true }

it('enters an import cycle below a module of application code at the same module', async () => {
  const { run } = await import('./application/entry.js')
  expect(run()).toEqual(expected)
})

it('enters an import cycle that the entry also reads while it is evaluated at the same module', async () => {
  const { run } = await import('./application-top-level-read/entry.js')
  expect(run()).toEqual(expected)
})

it('enters an import cycle below a module that is declared free of side effects at the same module', async () => {
  const { run } = await import('./declared/entry.js')
  expect(evaluated('declared')).toEqual([
    'config',
    'constants',
    'format',
    'entry',
  ])
  expect(run()).toEqual(expected)
})

it('enters an import cycle below a declared module at the same module when the entry reads the cycle while it is evaluated', async () => {
  const { run } = await import('./declared-top-level-read/entry.js')
  expect(evaluated('declared-top-level-read')).toEqual(['config'])
  expect(run()).toEqual(expected)
})

it('enters an import cycle that a declared module reads while it is evaluated at the same module', async () => {
  const { run } = await import('./declared-eager-import/entry.js')
  expect(evaluated('declared-eager-import')).toEqual([
    'config',
    'constants',
    'format',
    'entry',
  ])
  expect(run()).toEqual(expected)
})

it('enters an import cycle of three modules below a declared module that re-exports at the same module', async () => {
  const { run } = await import('./three-modules/entry.js')
  expect(evaluated('three-modules')).toEqual(['locales', 'config', 'entry'])
  expect(await run()).toEqual({
    shared: ['shared', 'shared'],
    described: 'de,en,fr,fr',
    locale: 'de',
  })
})
