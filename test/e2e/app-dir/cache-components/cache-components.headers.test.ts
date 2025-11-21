import { nextTestSetup } from 'e2e-utils'

describe('cache-components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should partially prerender pages that use headers', async () => {
    let $ = await next.render$('/headers/static-behavior', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#x-sentinel').text()).toBe('hello')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#x-sentinel').text()).toBe('hello')
    }
  })

  it('should be able to pass headers as a promise to another component and trigger an intermediate Suspense boundary', async () => {
    const $ = await next.render$('/headers/static-behavior/pass-deeply')
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#fallback').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#fallback').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at runtime')
    }
  })

  it('should be able to access headers properties asynchronously', async () => {
    let $ = await next.render$('/headers/exercise', {})
    let cookieWarnings = next.cliOutput
      .split('\n')
      .filter((l) => l.includes('Route "/headers/exercise'))

    expect(cookieWarnings).toHaveLength(0)

    // (await headers()).append('...', '...')
    expect($('#append-result-x-sentinel').text()).toContain(
      'Headers cannot be modified'
    )
    expect($('#append-value-x-sentinel').text()).toContain('hello')

    // (await headers()).delete('...')
    expect($('#delete-result-x-sentinel').text()).toContain(
      'Headers cannot be modified'
    )
    expect($('#delete-value-x-sentinel').text()).toContain('hello')

    // (await headers()).get('...')
    expect($('#get-x-sentinel').text()).toContain('hello')

    // cookies().has('...')
    expect($('#has-x-sentinel').text()).toContain('true')
    expect($('#has-x-sentinel-foobar').text()).toContain('false')

    // (await headers()).set('...', '...')
    expect($('#set-result-x-sentinel').text()).toContain(
      'Headers cannot be modified'
    )
    expect($('#set-value-x-sentinel').text()).toContain('hello')

    // (await headers()).getSetCookie()
    // This is always empty because headers() represents Request headers
    // not response headers and is not mutable.
    expect($('#get-set-cookie').text()).toEqual('[]')

    // (await headers()).forEach(...)
    expect($('#for-each-x-sentinel').text()).toContain('hello')
    expect($('#for-each-x-sentinel-path').text()).toContain('/headers/exercise')
    expect($('#for-each-x-sentinel-rand').length).toBe(1)

    // (await headers()).keys(...)
    expect($('#keys-x-sentinel').text()).toContain('x-sentinel')
    expect($('#keys-x-sentinel-path').text()).toContain('x-sentinel-path')
    expect($('#keys-x-sentinel-rand').text()).toContain('x-sentinel-rand')

    // (await headers()).values(...)
    expect($('[data-class="values"]').text()).toContain('hello')
    expect($('[data-class="values"]').text()).toContain('/headers/exercise')
    expect($('[data-class="values"]').length).toBe(3)

    // (await headers()).entries(...)
    expect($('#entries-x-sentinel').text()).toContain('hello')
    expect($('#entries-x-sentinel-path').text()).toContain('/headers/exercise')
    expect($('#entries-x-sentinel-rand').length).toBe(1)

    // for...of (await headers())
    expect($('#for-of-x-sentinel').text()).toContain('hello')
    expect($('#for-of-x-sentinel-path').text()).toContain('/headers/exercise')
    expect($('#for-of-x-sentinel-rand').length).toBe(1)

    // ...(await headers())
    expect($('#spread-x-sentinel').text()).toContain('hello')
    expect($('#spread-x-sentinel-path').text()).toContain('/headers/exercise')
    expect($('#spread-x-sentinel-rand').length).toBe(1)
  })
})
