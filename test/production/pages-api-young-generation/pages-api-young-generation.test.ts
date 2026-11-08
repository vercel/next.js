import { nextTestSetup } from 'e2e-utils'

// V8 allocates two kinds of objects in the old generation from the start: a
// function expression that is assigned to a property
// (`res.json = (body) => {}`), until TurboFan has optimized the function that
// creates it, which takes hundreds to thousands of requests, and the internal
// pair of functions of an accessor property. When Next.js creates one for
// every request, it is garbage in the old generation as soon as the request
// ends, and until the next major garbage collection it keeps everything alive
// that it references, here the request and the response.
describe('pages-api-young-generation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not allocate the response functions of an API route in the old generation', async () => {
    const res = await next.fetch('/api/response-functions')
    expect(await res.json()).toEqual({
      // A function expression that is assigned to a property, as a check
      // that V8 still treats it the way this test assumes. The function that
      // creates it runs once for each request of this test, so it is not
      // optimized.
      control: false,
      write: true,
      end: true,
      status: true,
      send: true,
      json: true,
      redirect: true,
      setDraftMode: true,
      setPreviewData: true,
      clearPreviewData: true,
      revalidate: true,
    })
  })

  // The accessors of a lazy request property are the same functions for all
  // requests, so the pair that V8 keeps for them cannot reference a request.
  it('should not create accessors for the lazy request properties of each request', async () => {
    const request = async (name: string) => {
      const res = await next.fetch('/api/lazy-properties', {
        headers: { cookie: `name=${name}` },
      })
      return res.json()
    }
    const plainProperty = {
      configurable: true,
      enumerable: true,
      writable: true,
    }
    const expected = (name: string) => ({
      lazy: true,
      sameAsPreviousRequest: expect.any(Boolean),
      cookies: { name },
      cookiesAfterRead: { ...plainProperty, value: { name } },
      draftModeAfterAssignment: { ...plainProperty, value: true },
      preview: null,
    })

    expect(await request('first')).toEqual(expected('first'))
    const second = await request('second')
    expect(second).toEqual(expected('second'))
    expect(second.sameAsPreviousRequest).toBe(true)
  })
})
