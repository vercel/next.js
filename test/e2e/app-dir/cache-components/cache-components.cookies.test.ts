import { nextTestSetup } from 'e2e-utils'

describe('cache-components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should partially prerender pages that use cookies', async () => {
    let $ = await next.render$('/cookies/static-behavior', {})
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

  it('should be able to pass cookies as a promise to another component and trigger an intermediate Suspense boundary', async () => {
    const $ = await next.render$('/cookies/static-behavior/pass-deeply')
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

  it('should be able to access cookie properties', async () => {
    let $ = await next.render$('/cookies/exercise', {})
    let cookieWarnings = next.cliOutput
      .split('\n')
      .filter((l) => l.includes('Route "/cookies/exercise'))

    expect(cookieWarnings).toHaveLength(0)

    // For...of iteration
    expect($('#for-of-x-sentinel').text()).toContain('hello')
    expect($('#for-of-x-sentinel-path').text()).toContain('/cookies/exercise')
    expect($('#for-of-x-sentinel-rand').text()).toContain('x-sentinel-rand')

    // ...spread iteration
    expect($('#spread-x-sentinel').text()).toContain('hello')
    expect($('#spread-x-sentinel-path').text()).toContain('/cookies/exercise')
    expect($('#spread-x-sentinel-rand').text()).toContain('x-sentinel-rand')

    // cookies().size
    expect(parseInt($('#size-cookies').text())).toBeGreaterThanOrEqual(3)

    // cookies().get('...') && cookies().getAll('...')
    expect($('#get-x-sentinel').text()).toContain('hello')
    expect($('#get-x-sentinel-path').text()).toContain('/cookies/exercise')
    expect($('#get-x-sentinel-rand').text()).toContain('x-sentinel-rand')

    // cookies().has('...')
    expect($('#has-x-sentinel').text()).toContain('true')
    expect($('#has-x-sentinel-foobar').text()).toContain('false')

    // cookies().set('...', '...')
    expect($('#set-result-x-sentinel').text()).toContain(
      'Cookies can only be modified in a Server Action'
    )
    expect($('#set-value-x-sentinel').text()).toContain('hello')

    // cookies().delete('...', '...')
    expect($('#delete-result-x-sentinel').text()).toContain(
      'Cookies can only be modified in a Server Action'
    )
    expect($('#delete-value-x-sentinel').text()).toContain('hello')

    // cookies().clear()
    expect($('#clear-result').text()).toContain(
      'Cookies can only be modified in a Server Action'
    )
    expect($('#clear-value-x-sentinel').text()).toContain('hello')

    // cookies().toString()
    expect($('#toString').text()).toContain('x-sentinel=hello')
    expect($('#toString').text()).toContain('x-sentinel-path')
    expect($('#toString').text()).toContain('x-sentinel-rand=')
  })
})
