import { nextTestSetup } from 'e2e-utils'

// Regression test for `"imports": { "#/*": "./src/*" }` in package.json.
// Node.js allowed this in nodejs/node#60864, and both Turbopack and webpack
// (enhanced-resolve >= 5.18.4) now resolve `#/...` specifiers via the imports
// field instead of rejecting them.
describe('subpath-imports-slash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      imports: {
        '#/*': './src/*',
      },
    },
  })

  it('should resolve #/* subpath imports in the app package', async () => {
    const $ = await next.render$('/')
    expect($('#greeting').text()).toBe('hello from #/greeting')
  })

  it('should resolve #/* subpath imports inside an external package', async () => {
    const $ = await next.render$('/')
    expect($('#external').text()).toBe('hello from external #/value')
  })
})
