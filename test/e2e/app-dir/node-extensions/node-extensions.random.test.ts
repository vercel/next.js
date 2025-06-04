import { nextTestSetup } from 'e2e-utils'

describe('Node Extensions', () => {
  describe('Random', () => {
    describe('Dynamic IO', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/random/dynamic-io',
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      it('should not error when accessing middlware that use Math.random()', async () => {
        let res, $

        res = await next.fetch('/rewrite')
        expect(res.status).toBe(200)
        $ = await next.render$('/rewrite')
        expect($('main section').text()).toBe('rewritten')
      })

      it('should not error when accessing pages that use Math.random() in App Router', async () => {
        let res, $

        res = await next.fetch('/app/prerendered/uncached')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/prerendered/uncached')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/prerendered/unstable-cache')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/prerendered/unstable-cache')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/prerendered/use-cache')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/prerendered/use-cache')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/rendered/uncached')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/rendered/uncached')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/rendered/unstable-cache')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/rendered/unstable-cache')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/rendered/use-cache')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/rendered/use-cache')
        expect($('li').length).toBe(2)
      })

      it('should not error when accessing routes that use Math.random() in App Router', async () => {
        let res, body

        res = await next.fetch('/app/prerendered/uncached/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/prerendered/unstable-cache/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/prerendered/use-cache/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/rendered/uncached/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/rendered/unstable-cache/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/rendered/use-cache/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })
      })

      it('should not error when accessing pages that use Math.random() in Pages Router', async () => {
        let res, $

        res = await next.fetch('/pages/gip/random')
        expect(res.status).toBe(200)
        $ = await next.render$('/pages/gip/random')
        expect($('li').length).toBe(2)

        res = await next.fetch('/pages/gssp/random')
        expect(res.status).toBe(200)
        $ = await next.render$('/pages/gssp/random')
        expect($('li').length).toBe(2)

        res = await next.fetch('/pages/gsp/random')
        expect(res.status).toBe(200)
        $ = await next.render$('/pages/gsp/random')
        expect($('li').length).toBe(2)
      })

      it('should not error when accessing routes that use Math.random() in Pages Router', async () => {
        let res, body

        res = await next.fetch('/api/random')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        expect(body.rand1).not.toBe(body.rand2)

        const first1 = body.rand1
        const first2 = body.rand2

        res = await next.fetch('/api/random')
        body = await res.json()
        expect(body.rand1).not.toBe(body.rand2)
        expect(body.rand1).not.toBe(first1)
        expect(body.rand2).not.toBe(first2)
      })
    })

    describe('Legacy', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/random/legacy',
      })

      if (skipped) {
        return
      }

      it('should not error when accessing middlware that use Math.random()', async () => {
        let res, $

        res = await next.fetch('/rewrite')
        expect(res.status).toBe(200)
        $ = await next.render$('/rewrite')
        expect($('main section').text()).toBe('rewritten')
      })

      it('should not error when accessing pages that use Math.random() in App Router', async () => {
        let res, $

        res = await next.fetch('/app/prerendered/uncached')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/prerendered/uncached')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/prerendered/unstable-cache')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/prerendered/unstable-cache')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/rendered/uncached')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/rendered/uncached')
        expect($('li').length).toBe(2)

        res = await next.fetch('/app/rendered/unstable-cache')
        expect(res.status).toBe(200)
        $ = await next.render$('/app/rendered/unstable-cache')
        expect($('li').length).toBe(2)
      })

      it('should not error when accessing routes that use Math.random() in App Router', async () => {
        let res, body

        res = await next.fetch('/app/prerendered/uncached/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/prerendered/unstable-cache/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/rendered/uncached/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        res = await next.fetch('/app/rendered/unstable-cache/api')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })
      })

      it('should not error when accessing pages that use Math.random() in Pages Router', async () => {
        let res, $

        res = await next.fetch('/pages/gip/random')
        expect(res.status).toBe(200)
        $ = await next.render$('/pages/gip/random')
        expect($('li').length).toBe(2)

        res = await next.fetch('/pages/gssp/random')
        expect(res.status).toBe(200)
        $ = await next.render$('/pages/gssp/random')
        expect($('li').length).toBe(2)

        res = await next.fetch('/pages/gsp/random')
        expect(res.status).toBe(200)
        $ = await next.render$('/pages/gsp/random')
        expect($('li').length).toBe(2)
      })

      it('should not error when accessing routes that use Math.random() in Pages Router', async () => {
        let res, body

        res = await next.fetch('/api/random')
        expect(res.status).toBe(200)
        body = await res.json()
        expect(body).toEqual({
          rand1: expect.any(Number),
          rand2: expect.any(Number),
        })

        expect(body.rand1).not.toBe(body.rand2)

        const first1 = body.rand1
        const first2 = body.rand2

        res = await next.fetch('/api/random')
        body = await res.json()
        expect(body.rand1).not.toBe(body.rand2)
        expect(body.rand1).not.toBe(first1)
        expect(body.rand2).not.toBe(first2)
      })
    })
  })
})
