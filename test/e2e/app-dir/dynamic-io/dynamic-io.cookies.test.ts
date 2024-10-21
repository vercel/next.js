import { nextTestSetup } from 'e2e-utils'

const WITH_PPR = !!process.env.__NEXT_EXPERIMENTAL_PPR

describe('dynamic-io', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use async cookies', async () => {
      let $ = await next.render$('/cookies/static-behavior/async', {})
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

    it('should partially prerender pages that use sync cookies', async () => {
      let $ = await next.render$('/cookies/static-behavior/sync', {})
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
  } else {
    it('should produce dynamic pages when using async or sync cookies', async () => {
      let $ = await next.render$('/cookies/static-behavior/sync', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#x-sentinel').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#x-sentinel').text()).toBe('hello')
      }

      $ = await next.render$('/cookies/static-behavior/async', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#x-sentinel').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#x-sentinel').text()).toBe('hello')
      }
    })
  }

  if (WITH_PPR) {
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
  }

  it('should be able to access cookie properties asynchronously', async () => {
    let $ = await next.render$('/cookies/exercise/async', {})
    let cookieWarnings = next.cliOutput
      .split('\n')
      .filter((l) => l.includes('Route "/cookies/exercise'))

    expect(cookieWarnings).toHaveLength(0)

    // For...of iteration
    expect($('#for-of-x-sentinel').text()).toContain('hello')
    expect($('#for-of-x-sentinel-path').text()).toContain(
      '/cookies/exercise/async'
    )
    expect($('#for-of-x-sentinel-rand').text()).toContain('x-sentinel-rand')

    // ...spread iteration
    expect($('#spread-x-sentinel').text()).toContain('hello')
    expect($('#spread-x-sentinel-path').text()).toContain(
      '/cookies/exercise/async'
    )
    expect($('#spread-x-sentinel-rand').text()).toContain('x-sentinel-rand')

    // cookies().size
    expect(parseInt($('#size-cookies').text())).toBeGreaterThanOrEqual(3)

    // cookies().get('...') && cookies().getAll('...')
    expect($('#get-x-sentinel').text()).toContain('hello')
    expect($('#get-x-sentinel-path').text()).toContain(
      '/cookies/exercise/async'
    )
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

  it('should be able to access cookie properties synchronously', async () => {
    let $ = await next.render$('/cookies/exercise/sync', {})
    let cookieWarnings = next.cliOutput
      .split('\n')
      .filter((l) => l.includes('Route "/cookies/exercise'))

    if (!isNextDev) {
      expect(cookieWarnings).toHaveLength(0)
    }
    let i = 0

    // For...of iteration
    expect($('#for-of-x-sentinel').text()).toContain('hello')
    expect($('#for-of-x-sentinel-path').text()).toContain(
      '/cookies/exercise/sync'
    )
    expect($('#for-of-x-sentinel-rand').text()).toContain('x-sentinel-rand')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain(
        '`...cookies()` or similar iteration.'
      )
    }

    // ...spread iteration
    expect($('#spread-x-sentinel').text()).toContain('hello')
    expect($('#spread-x-sentinel-path').text()).toContain(
      '/cookies/exercise/sync'
    )
    expect($('#spread-x-sentinel-rand').text()).toContain('x-sentinel-rand')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain(
        '`...cookies()` or similar iteration.'
      )
    }

    // cookies().size
    expect(parseInt($('#size-cookies').text())).toBeGreaterThanOrEqual(3)
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain('`cookies().size`')
    }

    // cookies().get('...') && cookies().getAll('...')
    expect($('#get-x-sentinel').text()).toContain('hello')
    expect($('#get-x-sentinel-path').text()).toContain('/cookies/exercise/sync')
    expect($('#get-x-sentinel-rand').text()).toContain('x-sentinel-rand')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain("`cookies().get('x-sentinel')`")
      expect(cookieWarnings[i++]).toContain(
        "`cookies().get('x-sentinel-path')`"
      )
      expect(cookieWarnings[i++]).toContain(
        "`cookies().getAll('x-sentinel-rand')`"
      )
    }

    // cookies().has('...')
    expect($('#has-x-sentinel').text()).toContain('true')
    expect($('#has-x-sentinel-foobar').text()).toContain('false')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain("`cookies().has('x-sentinel')`")
      expect(cookieWarnings[i++]).toContain(
        "`cookies().has('x-sentinel-foobar')`"
      )
    }

    // cookies().set('...', '...')
    expect($('#set-result-x-sentinel').text()).toContain(
      'Cookies can only be modified in a Server Action'
    )
    expect($('#set-value-x-sentinel').text()).toContain('hello')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain(
        "`cookies().set('x-sentinel', ...)`"
      )
      expect(cookieWarnings[i++]).toContain("`cookies().get('x-sentinel')`")
    }

    // cookies().delete('...', '...')
    expect($('#delete-result-x-sentinel').text()).toContain(
      'Cookies can only be modified in a Server Action'
    )
    expect($('#delete-value-x-sentinel').text()).toContain('hello')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain("`cookies().delete('x-sentinel')`")
      expect(cookieWarnings[i++]).toContain("`cookies().get('x-sentinel')`")
    }

    // cookies().clear()
    expect($('#clear-result').text()).toContain(
      'Cookies can only be modified in a Server Action'
    )
    expect($('#clear-value-x-sentinel').text()).toContain('hello')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain('`cookies().clear()`')
      expect(cookieWarnings[i++]).toContain("`cookies().get('x-sentinel')`")
    }

    // cookies().toString()
    expect($('#toString').text()).toContain('x-sentinel=hello')
    expect($('#toString').text()).toContain('x-sentinel-path')
    expect($('#toString').text()).toContain('x-sentinel-rand=')
    if (isNextDev) {
      expect(cookieWarnings[i++]).toContain(
        '`cookies().toString()` or implicit casting'
      )
    }

    if (isNextDev) {
      expect(i).toBe(cookieWarnings.length)
    }
  })
})
