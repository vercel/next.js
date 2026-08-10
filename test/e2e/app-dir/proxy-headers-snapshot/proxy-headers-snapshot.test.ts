import { nextTestSetup } from 'e2e-utils'

describe('proxy-headers-snapshot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('headers() observes NextRequest.headers mutations during Proxy', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({
      valueBeforeMutation: null,
      valueOnNextRequest: 'set-on-next-request',
      valueFromFirstViewAfterMutation: 'set-on-next-request',
      valueFromSecondViewAfterMutation: 'set-on-next-request',
      sameHeadersObject: true,
    })
  })
})
