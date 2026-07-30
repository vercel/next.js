import { nextTestSetup } from 'e2e-utils'

describe('cache-components-not-found', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should fill the dynamic hole of the root not-found on resume', async () => {
    const $ = await next.render$('/does-not-exist')

    expect($('h1').text()).toBe('Global Not Found')

    if (isNextDev) {
      // In dev there is no static shell, everything renders at runtime.
      expect($('#not-found-shell').text()).toBe('at runtime')
      expect($('#not-found-hole').text()).toBe('at runtime')
    } else {
      // The static shell of the global not-found is prerendered, including the
      // Suspense fallback that surrounds the `connection()` access.
      expect($('#not-found-shell').text()).toBe('at buildtime')
      expect($('#not-found-fallback').text()).toBe('at buildtime')
      if (isNextDeploy) {
        // FIXME: Vercel does not resume. The dynamic hole is never filled and the content never streams in
        expect($('#not-found-hole').text()).toBe('')
      } else {
        // The dynamic hole is refilled when the render resumes at request time,
        // replacing the prerendered fallback with the resumed content.
        expect($('#not-found-hole').text()).toBe('at runtime')
      }
    }
  })
})
