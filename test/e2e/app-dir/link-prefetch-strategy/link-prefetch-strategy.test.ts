import { nextTestSetup } from 'e2e-utils'

describe('link-prefetch-strategy', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('should skip next dev for now', () => {})
    return
  }
  it('should prefetch viewport', async () => {
    const requests: string[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', async (req) => {
          const url = new URL(req.url())
          if (url.searchParams.has('_rsc')) {
            requests.push(url.pathname)
          }
        })
      },
    })
    await browser.waitForIdleNetwork()

    expect(requests).toMatchInlineSnapshot(`
     [
       "/test/viewport",
     ]
    `)
  })

  it('should prefetch predict', async () => {
    const requests: string[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', async (req) => {
          const url = new URL(req.url())
          if (url.searchParams.has('_rsc')) {
            requests.push(url.pathname)
          }
        })
      },
    })
    await browser.elementById('predict').moveTo()
    await browser.waitForIdleNetwork()

    expect(requests).toMatchInlineSnapshot(`
     [
       "/test/viewport",
       "/test/predict",
     ]
    `)
  })

  it('should prefetch intent + predict', async () => {
    const requests: string[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', async (req) => {
          const url = new URL(req.url())
          if (url.searchParams.has('_rsc')) {
            requests.push(url.pathname)
          }
        })
      },
    })
    // the link with `intent` is near to `predict`, hence the another one should be prefetched too.
    await browser.elementById('intent').moveTo()
    await browser.waitForIdleNetwork()

    expect(requests).toMatchInlineSnapshot(`
     [
       "/test/viewport",
       "/test/intent",
       "/test/predict",
     ]
    `)
  })
})
