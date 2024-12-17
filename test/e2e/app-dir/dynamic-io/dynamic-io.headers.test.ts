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
    it('should partially prerender pages that use async headers', async () => {
      let $ = await next.render$('/headers/static-behavior/async', {})
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

    it('should partially prerender pages that use sync headers', async () => {
      let $ = await next.render$('/headers/static-behavior/sync', {})
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
    it('should produce dynamic pages when using async or sync headers', async () => {
      let $ = await next.render$('/headers/static-behavior/sync', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#x-sentinel').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#x-sentinel').text()).toBe('hello')
      }

      $ = await next.render$('/headers/static-behavior/async', {})
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
  }

  it('should be able to access headers properties asynchronously', async () => {
    let $ = await next.render$('/headers/exercise/async', {})
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
    expect($('#for-each-x-sentinel-path').text()).toContain(
      '/headers/exercise/async'
    )
    expect($('#for-each-x-sentinel-rand').length).toBe(1)

    // (await headers()).keys(...)
    expect($('#keys-x-sentinel').text()).toContain('x-sentinel')
    expect($('#keys-x-sentinel-path').text()).toContain('x-sentinel-path')
    expect($('#keys-x-sentinel-rand').text()).toContain('x-sentinel-rand')

    // (await headers()).values(...)
    expect($('[data-class="values"]').text()).toContain('hello')
    expect($('[data-class="values"]').text()).toContain(
      '/headers/exercise/async'
    )
    expect($('[data-class="values"]').length).toBe(3)

    // (await headers()).entries(...)
    expect($('#entries-x-sentinel').text()).toContain('hello')
    expect($('#entries-x-sentinel-path').text()).toContain(
      '/headers/exercise/async'
    )
    expect($('#entries-x-sentinel-rand').length).toBe(1)

    // for...of (await headers())
    expect($('#for-of-x-sentinel').text()).toContain('hello')
    expect($('#for-of-x-sentinel-path').text()).toContain(
      '/headers/exercise/async'
    )
    expect($('#for-of-x-sentinel-rand').length).toBe(1)

    // ...(await headers())
    expect($('#spread-x-sentinel').text()).toContain('hello')
    expect($('#spread-x-sentinel-path').text()).toContain(
      '/headers/exercise/async'
    )
    expect($('#spread-x-sentinel-rand').length).toBe(1)
  })

  it('should be able to access headers properties synchronously', async () => {
    let $ = await next.render$('/headers/exercise/sync', {})
    let headerWarnings = next.cliOutput
      .split('\n')
      .filter((l) => l.includes('Route "/headers/exercise'))

    if (!isNextDev) {
      expect(headerWarnings).toHaveLength(0)
    }
    let i = 0

    // headers().append('...', '...')
    expect($('#append-result-x-sentinel').text()).toContain(
      'Headers cannot be modified'
    )
    expect($('#append-value-x-sentinel').text()).toContain('hello')
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain(
        "`headers().append('x-sentinel', ...)`"
      )
      expect(headerWarnings[i++]).toContain("`headers().get('x-sentinel')`")
    }

    // headers().delete('...')
    expect($('#delete-result-x-sentinel').text()).toContain(
      'Headers cannot be modified'
    )
    expect($('#delete-value-x-sentinel').text()).toContain('hello')
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain("`headers().delete('x-sentinel')`")
      expect(headerWarnings[i++]).toContain("`headers().get('x-sentinel')`")
    }

    // headers().get('...')
    expect($('#get-x-sentinel').text()).toContain('hello')
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain("`headers().get('x-sentinel')`")
    }

    // cookies().has('...')
    expect($('#has-x-sentinel').text()).toContain('true')
    expect($('#has-x-sentinel-foobar').text()).toContain('false')
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain("`headers().has('x-sentinel')`")
      expect(headerWarnings[i++]).toContain(
        "`headers().has('x-sentinel-foobar')`"
      )
    }

    // headers().set('...', '...')
    expect($('#set-result-x-sentinel').text()).toContain(
      'Headers cannot be modified'
    )
    expect($('#set-value-x-sentinel').text()).toContain('hello')
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain(
        "`headers().set('x-sentinel', ...)`"
      )
      expect(headerWarnings[i++]).toContain("`headers().get('x-sentinel')`")
    }

    // headers().getSetCookie()
    // This is always empty because headers() represents Request headers
    // not response headers and is not mutable.
    expect($('#get-set-cookie').text()).toEqual('[]')
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain('`headers().getSetCookie()`')
    }

    // headers().forEach(...)
    expect($('#for-each-x-sentinel').text()).toContain('hello')
    expect($('#for-each-x-sentinel-path').text()).toContain(
      '/headers/exercise/sync'
    )
    expect($('#for-each-x-sentinel-rand').length).toBe(1)
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain('`headers().forEach(...)`')
    }

    // headers().keys(...)
    expect($('#keys-x-sentinel').text()).toContain('x-sentinel')
    expect($('#keys-x-sentinel-path').text()).toContain('x-sentinel-path')
    expect($('#keys-x-sentinel-rand').text()).toContain('x-sentinel-rand')
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain('`headers().keys()`')
    }

    // headers().values(...)
    expect($('[data-class="values"]').text()).toContain('hello')
    expect($('[data-class="values"]').text()).toContain(
      '/headers/exercise/sync'
    )
    expect($('[data-class="values"]').length).toBe(3)
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain('`headers().values()`')
    }

    // headers().entries(...)
    expect($('#entries-x-sentinel').text()).toContain('hello')
    expect($('#entries-x-sentinel-path').text()).toContain(
      '/headers/exercise/sync'
    )
    expect($('#entries-x-sentinel-rand').length).toBe(1)
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain('`headers().entries()`')
    }

    // for...of headers()
    expect($('#for-of-x-sentinel').text()).toContain('hello')
    expect($('#for-of-x-sentinel-path').text()).toContain(
      '/headers/exercise/sync'
    )
    expect($('#for-of-x-sentinel-rand').length).toBe(1)
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain(
        '`...headers()` or similar iteration'
      )
    }

    // ...headers()
    expect($('#spread-x-sentinel').text()).toContain('hello')
    expect($('#spread-x-sentinel-path').text()).toContain(
      '/headers/exercise/sync'
    )
    expect($('#spread-x-sentinel-rand').length).toBe(1)
    if (isNextDev) {
      expect(headerWarnings[i++]).toContain(
        '`...headers()` or similar iteration'
      )
    }

    if (isNextDev) {
      expect(i).toBe(headerWarnings.length)
    }
  })
})
