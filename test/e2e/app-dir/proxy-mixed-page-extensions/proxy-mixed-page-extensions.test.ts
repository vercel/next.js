import { nextTestSetup } from 'e2e-utils'

describe('proxy-mixed-page-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should detect proxy.page.tsx when pageExtensions mixes compound and simple', async () => {
    // pageExtensions = ['page.tsx', 'tsx']: the compound rule must still
    // recognize `proxy.page.tsx` as a proxy. The simple rule (`tsx`)
    // shouldn't accidentally take over and route the file as something
    // else, nor should the convention loop confuse `proxy.page.tsx` with
    // a non-proxy file.
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-proxy-ran')).toBe('true')
    const html = await res.text()
    expect(html).toContain('hello from proxy-mixed-page-extensions')
  })
})
