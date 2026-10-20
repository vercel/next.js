let evaluations = 0
const track = (name) => {
  evaluations++
  return name
}

const assetUrl = (name) =>
  new URL(`./assets/${track(name)}`, import.meta.url).toString()
const singleUrl = (name) =>
  new URL(`./single/${track(name)}`, import.meta.url).toString()
const noMatchUrl = (name) => {
  try {
    return new URL(`./no-match/${track(name)}`, import.meta.url).toString()
  } catch (e) {
    return e
  }
}

const expectModuleNotFound = (fn) => {
  const before = evaluations
  let error
  try {
    fn()
  } catch (e) {
    error = e
  }
  expect(error).toBeDefined()
  expect(error.code).toBe('MODULE_NOT_FOUND')
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

it('should throw MODULE_NOT_FOUND for a request that matched no file', () => {
  expectModuleNotFound(() => assetUrl('missing.txt'))
  expectModuleNotFound(() => singleUrl('missing.txt'))
})

it('should throw MODULE_NOT_FOUND for a pattern that matched nothing', () => {
  const before = evaluations
  const error = noMatchUrl('anything.txt')
  expect(error).toBeInstanceOf(Error)
  expect(error.code).toBe('MODULE_NOT_FOUND')
  expect(evaluations - before).toBe(1)
})

it('should evaluate the request expression exactly once', () => {
  const before = evaluations
  assetUrl('beta.txt')
  expect(evaluations - before).toBe(1)
})
