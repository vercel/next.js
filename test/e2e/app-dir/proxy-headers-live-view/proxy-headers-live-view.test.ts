import { nextTestSetup } from 'e2e-utils'

describe('proxy-headers-live-view', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should observe writes to NextRequest.headers in headers()', async () => {
    const res = await next.fetch('/probe')
    expect(res.status).toBe(200)

    await expect(res.json()).resolves.toEqual({
      valueBeforeMutation: null,
      valueOnRequest: 'set-during-proxy',
      valueOnFirstView: 'set-during-proxy',
      valueOnSecondView: 'set-during-proxy',
      sameView: true,
      // Internal headers stay on the request for framework plumbing, and stay
      // hidden from userland `headers()`, even when they are written after the
      // first `headers()` call.
      internalHeaderOnRequest: 'set-during-proxy',
      internalHeaderOnView: null,
      internalHeaderIsIterated: false,
    })
  })

  it('should render pages that Proxy passes through', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
