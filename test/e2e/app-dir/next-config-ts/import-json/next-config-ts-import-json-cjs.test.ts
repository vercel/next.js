import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('next-config-ts-import-json-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support import json (CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
