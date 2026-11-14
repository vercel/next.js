import { nextTestSetup } from 'e2e-utils'

// The request store computes `headers`, `cookies` and its other lazy members
// on first use. They must not be accessors of the store object itself. An
// accessor in an object literal is a function that is created for that one
// object, and V8 does not free what such a function captures (here everything
// that belongs to the request) in minor garbage collections: it moves it to
// the old generation, which makes every minor collection slower and causes
// major collections.
describe('request-store-accessors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not create accessors for each request store', async () => {
    const res = await next.fetch('/', {
      headers: { cookie: 'session=5f2b7c1e', 'user-agent': 'test' },
    })

    expect(await res.json()).toEqual({
      type: 'request',
      ownAccessors: [],
      session: '5f2b7c1e',
      userAgent: 'test',
    })
  })

  // What the accessors read and keep (the request headers, the preview keys,
  // the computed members) is internal: a store that is printed or serialized,
  // before or after its members were used, must not show it.
  it('should not show the request headers or the preview keys when a request store is printed', async () => {
    const res = await next.fetch('/printed', {
      headers: { cookie: 'session=5f2b7c1e', 'user-agent': 'test' },
    })

    expect(await res.json()).toEqual({
      used: ['test', '5f2b7c1e', '5f2b7c1e', false],
      printsRequestHeaders: false,
      printsPreviewKeys: false,
    })
  })
})
