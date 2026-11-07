import { nextTestSetup } from 'e2e-utils'

// V8 allocates a function expression that is assigned to a property
// (`res.setHeader = (name, value) => {}`) in the old generation, because such
// functions are usually methods that live long. When Next.js creates one for
// every request, it is garbage in the old generation as soon as the request
// ends, and until the next major garbage collection it keeps everything alive
// that it references, here the request and the response. The routes of this
// app ask V8 where the functions are that Next.js installs for each request.
describe('request-closures-young-generation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not allocate the patched res.setHeader in the old generation', async () => {
    const res = await next.fetch('/api/set-header')
    expect(await res.json()).toEqual({
      // A function expression that is assigned to a property, as a check
      // that V8 still treats it the way this test assumes.
      control: false,
      setHeader: true,
    })
    expect(res.headers.get('x-test')).toBe('1')
  })

  it('should not allocate the module loading handlers of a render in the old generation', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('control:false')
    expect(html).toContain('require:true')
    expect(html).toContain('loadChunk:true')
  })

  // The error boundaries are Client Components, and every server render of a
  // segment with an `error.js` file creates one. `reset` and `retry` are
  // created for each instance.
  it('should not allocate the reset and retry functions of an error boundary in the old generation', async () => {
    const res = await next.fetch('/error-boundaries')
    const html = await res.text()
    expect(html).toContain('control:false')
    expect(html).toContain('errorBoundary.reset:true')
    expect(html).toContain('errorBoundary.retry:true')
    expect(html).toContain('catchError.reset:true')
    expect(html).toContain('catchError.retry:true')
  })
})
