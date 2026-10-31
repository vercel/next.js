import { nextTestSetup } from 'e2e-utils'

describe('redirect-duplicate-location-header', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // https://github.com/vercel/next.js/issues/99576
  it('sends one location header on the request that renders the redirect and on later ones', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await next.fetch('/not-rendered-yet', {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe('/target')
    }
  })
})
