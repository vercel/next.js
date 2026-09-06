import { nextTestSetup } from 'e2e-utils'

// `optimizePackageImports` assumes the listed packages are side effect free. A package that
// declares `sideEffects` in its package.json must still win over that assumption, otherwise
// side-effect-only registration modules (the `sidecar` pattern used by react-focus-lock and
// react-remove-scroll) get tree shaken away. See https://github.com/vercel/next.js/issues/96333
describe('optimizePackageImports - sideEffects declared in package.json', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should keep a module matching the sideEffects glob of an optimized package', async () => {
    const $ = await next.render$('/')
    expect($('#sidecar-lib-effects').text()).toContain('sidecar.js')
  })

  it('should still drop a module not matching the sideEffects glob of an optimized package', async () => {
    const $ = await next.render$('/')
    expect($('#sidecar-lib-effects').text()).not.toContain('other.js')
  })

  it('should keep a module of an optimized package declaring sideEffects: true', async () => {
    const $ = await next.render$('/')
    expect($('#side-effectful-lib-effects').text()).toContain('register.js')
  })
})
