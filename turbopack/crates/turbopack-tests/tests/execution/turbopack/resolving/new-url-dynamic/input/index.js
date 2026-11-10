let evaluations = 0
const track = (name) => {
  evaluations++
  return name
}

const assetUrl = (name) =>
  new URL(`./assets/${track(name)}`, import.meta.url).toString()
const singleUrl = (name) =>
  new URL(`./single/${track(name)}`, import.meta.url).toString()
const bareUrl = (name) => new URL(`assets/${name}`, import.meta.url).toString()
const bareSingleUrl = (name) =>
  new URL(`single/${name}`, import.meta.url).toString()
const suffixedUrl = (name, suffix) =>
  new URL(`./assets/${name}${suffix}`, import.meta.url).toString()
const constantSuffixUrl = (name) =>
  new URL(`./assets/${name}?v=1`, import.meta.url).toString()

let externalRequest = 'https://example.invalid/asset?v=1'
const externalUrl = () => new URL(externalRequest, import.meta.url).toString()

const fullyDynamicUrl = (request) =>
  new URL(request, import.meta.url).toString()

const noMatchUrl = (name) =>
  new URL(`./no-match/${track(name)}`, import.meta.url).toString()

const absoluteUrl = (name) =>
  new URL(`https://example.invalid/${track(name)}`, import.meta.url).toString()
const protocolRelativeUrl = (name) =>
  new URL(`//example.invalid/${track(name)}`, import.meta.url).toString()
const serverRelativeUrl = (name) =>
  new URL(`/no-such-dir/${track(name)}`, import.meta.url).toString()
const bareMissingUrl = (name) =>
  new URL(`no-such-dir/${track(name)}`, import.meta.url).toString()

const staticBareMissingUrl = () =>
  new URL('missing.txt', import.meta.url).toString()
const staticRelativeMissingUrl = () =>
  new URL('./missing.txt', import.meta.url).toString()

const expectAboutBlank = (fn) => {
  const before = evaluations
  expect(fn()).toBe('about:blank')
  expect(evaluations - before).toBe(1)
}

it('should resolve each runtime request of a dynamic new URL to its own asset', () => {
  const alpha = assetUrl('alpha.txt')
  const beta = assetUrl('beta.txt')
  const gamma = assetUrl('gamma.txt')

  expect(alpha).toMatch(/alpha\.[^/]*txt$/)
  expect(beta).toMatch(/beta\.[^/]*txt$/)
  expect(gamma).toMatch(/gamma\.[^/]*txt$/)
  expect(new Set([alpha, beta, gamma]).size).toBe(3)
})

it('should resolve a dynamic new URL that matches a single file', () => {
  expect(singleUrl('only.txt')).toMatch(/only\.[^/]*txt$/)
})

it('should resolve a request that matched no file to about:blank', () => {
  expectAboutBlank(() => assetUrl('missing.txt'))
  expectAboutBlank(() => singleUrl('missing.txt'))
})

it('should resolve a pattern that matched nothing to about:blank', () => {
  expect(noMatchUrl('anything.txt')).toBe('about:blank')
})

it('should resolve a dynamic new URL without a leading ./', () => {
  expect(bareUrl('alpha.txt')).toMatch(/alpha\.[^/]*txt$/)
  expect(bareUrl('beta.txt')).toMatch(/beta\.[^/]*txt$/)
})

it('should resolve a dynamic new URL with a query or fragment', () => {
  expect(suffixedUrl('alpha.txt', '?v=1')).toMatch(/alpha\.[^/]*txt$/)
  expect(suffixedUrl('beta.txt', '#fragment')).toMatch(/beta\.[^/]*txt$/)
  expect(constantSuffixUrl('gamma.txt')).toMatch(/gamma\.[^/]*txt$/)
})

it('should keep external URL alternatives that differ only by query distinct', () => {
  expect(externalUrl()).toBe('https://example.invalid/asset?v=1')
  externalRequest = 'https://example.invalid/asset?v=2'
  expect(externalUrl()).toBe('https://example.invalid/asset?v=2')
})

it('should leave a fully dynamic new URL untouched', () => {
  expect(fullyDynamicUrl('https://example.invalid/native.txt')).toBe(
    'https://example.invalid/native.txt'
  )
})

it('should evaluate the request expression exactly once', () => {
  const before = evaluations
  assetUrl('beta.txt')
  expect(evaluations - before).toBe(1)
})

it('should keep non-relative runtime requests that matched no file', () => {
  expect(bareUrl('missing.txt')).toMatch(/(^|\/)assets\/missing\.txt$/)
  expect(bareSingleUrl('missing.txt')).toMatch(/(^|\/)single\/missing\.txt$/)
  expect(bareSingleUrl('only.txt')).toMatch(/only\.[^/]*txt$/)
  const before = evaluations
  expect(absoluteUrl('x.txt')).toBe('https://example.invalid/x.txt')
  expect(protocolRelativeUrl('x.txt')).toMatch(
    /^([a-z]+:)?\/\/example\.invalid\/x\.txt$/
  )
  expect(serverRelativeUrl('x.txt')).toMatch(
    /^([a-z]+:\/\/)?\/no-such-dir\/x\.txt$/
  )
  expect(bareMissingUrl('x.txt')).toMatch(/(^|\/)no-such-dir\/x\.txt$/)
  expect(evaluations - before).toBe(4)
})

it('should keep a static bare request that matched no file', () => {
  expect(staticBareMissingUrl()).toMatch(/(^|\/)missing\.txt$/)
})

it('should resolve a static relative request that matched no file to about:blank', () => {
  expect(staticRelativeMissingUrl()).toBe('about:blank')
})
