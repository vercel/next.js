function notIgnoredDynamicImport() {
  return import('./vercel.mjs')
}

function notIgnoredDynamicImportWebpackIgnoreFalse() {
  return import(/* webpackIgnore: false */ './vercel.mjs')
}

function notIgnoredRequire() {
  return require('./vercel.cjs')
}

// turbopack shouldn't attempt to bundle these, and they should be preserved in
// the output
function ignoredDynamicImportWebpack() {
  return import(/* webpackIgnore: true */ './ignore.mjs')
}

function ignoredDynamicImportTurbopack() {
  return import(/* turbopackIgnore: true */ './ignore.mjs')
}

// this should work for cjs requires too
function ignoredRequireWebpack() {
  return require(/* webpackIgnore: true */ './ignore.cjs')
}

function ignoredRequireTurbopack() {
  return require(/* turbopackIgnore: true */ './ignore.cjs')
}

function ignoredDynamicRequire(plugin) {
  return require(/* turbopackIgnore: true */ plugin)
}

it('bundles references without an ignore comment', async () => {
  await expect(notIgnoredDynamicImport()).resolves.toHaveProperty(
    'default',
    'turbopack'
  )
  await expect(
    notIgnoredDynamicImportWebpackIgnoreFalse()
  ).resolves.toHaveProperty('default', 'turbopack')
  expect(notIgnoredRequire()).toBe('turbopack')
})

it('preserves ignored dynamic imports in the output', () => {
  for (const fn of [
    ignoredDynamicImportWebpack,
    ignoredDynamicImportTurbopack,
  ]) {
    const code = fn.toString()
    expect(code).toMatch(
      /\bimport\(\/\* \w+Ignore: true \*\/ '.\/ignore.mjs'\)/
    )
    expect(code).not.toContain('__turbopack_context__')
  }
})

it('preserves ignored requires in the output', () => {
  for (const fn of [ignoredRequireWebpack, ignoredRequireTurbopack]) {
    const code = fn.toString()
    expect(code).toMatch(
      /\brequire\(\/\* \w+Ignore: true \*\/ '.\/ignore.cjs'\)/
    )
    expect(code).not.toContain('__turbopack_context__')
  }
  const code = ignoredDynamicRequire.toString()
  expect(code).toContain('require(/* turbopackIgnore: true */ plugin)')
  expect(code).not.toContain('__turbopack_context__')
  // The ignored request is left to the runtime `require`, so it is not resolved
  // by Turbopack.
  expect(() => ignoredRequireTurbopack()).toThrow()
})
