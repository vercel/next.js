import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('next-config-ts-import-alias-paths-with-baseurl-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      dependencies: {
        typescript: '5.9.3',
      },
      type: 'module',
    },
  })

  it('should support import alias paths with baseUrl (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
