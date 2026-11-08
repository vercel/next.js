function ignoredStaticUrl() {
  return new URL(/* turbopackIgnore: true */ './missing.txt', import.meta.url)
}

function webpackIgnoredStaticUrl() {
  return new URL(/* webpackIgnore: true */ './missing.txt', import.meta.url)
}

function ignoredDynamicUrl(name) {
  return new URL(/* turbopackIgnore: true */ name, import.meta.url)
}

function ignoredPartiallyDynamicUrl(name) {
  return new URL(
    /* turbopackIgnore: true */ name ? name : './missing.txt',
    import.meta.url
  )
}

function optionalPartiallyDynamicUrl(options = {}) {
  return new URL(/* turbopackOptional: true */ options.url, import.meta.url)
}

function partiallyDynamicUrl(options = {}) {
  // Not ignored, so the `undefined` alternative fails to resolve and is
  // reported with a hint suggesting `turbopackIgnore`.
  return new URL(options.url, import.meta.url)
}

// Never called: these only check that the hint names the matching magic comment.
export function partiallyDynamicImport(options = {}) {
  return import(options.path)
}

export function partiallyDynamicRequire(options = {}) {
  return require(options.path)
}

function expectUnbundledUrl(url, name) {
  expect(url).toBeInstanceOf(URL)
  expect(url.protocol).toBe('file:')
  expect(url.pathname).toMatch(new RegExp(`/new-url-ignore/input/${name}$`))
}

it('leaves an ignored static new URL() to runtime', () => {
  expectUnbundledUrl(ignoredStaticUrl(), 'missing.txt')
})

it('supports webpackIgnore on new URL()', () => {
  expectUnbundledUrl(webpackIgnoredStaticUrl(), 'missing.txt')
})

it('leaves an ignored dynamic new URL() to runtime', () => {
  expectUnbundledUrl(ignoredDynamicUrl('./runtime.txt'), 'runtime.txt')
})

it('leaves an ignored partially dynamic new URL() to runtime', () => {
  expectUnbundledUrl(ignoredPartiallyDynamicUrl(), 'missing.txt')
  expectUnbundledUrl(ignoredPartiallyDynamicUrl('./runtime.txt'), 'runtime.txt')
})

it('supports turbopackOptional on new URL()', () => {
  expectUnbundledUrl(
    optionalPartiallyDynamicUrl({ url: './runtime.txt' }),
    'runtime.txt'
  )
})

it('keeps a partially dynamic new URL() working at runtime', () => {
  expectUnbundledUrl(
    partiallyDynamicUrl({ url: './runtime.txt' }),
    'runtime.txt'
  )
})
