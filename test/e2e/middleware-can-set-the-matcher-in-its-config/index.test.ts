import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('Middleware can set the matcher in its config', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page({ message }) { 
            return <div>
              <p>root page</p>
              <p>{message}</p>
            </div>
          } 

          export const getServerSideProps = () => {
            return {
              props: {
                message: "Hello, world."
              }
            }
          }
        `,
        'pages/with-middleware/index.js': `
          export default function Page({ message }) { 
            return <div>
              <p>This should run the middleware</p>
              <p>{message}</p>
            </div>
          } 

          export const getServerSideProps = () => {
            return {
              props: {
                message: "Hello, cruel world."
              }
            }
          }
        `,
        'pages/another-middleware/index.js': `
          export default function Page({ message }) { 
            return <div>
              <p>This should also run the middleware</p>
              <p>{message}</p>
            </div>
          } 

          export const getServerSideProps = () => {
            return {
              props: {
                message: "Hello, magnificent world."
              }
            }
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server'
          export const config = {
            matcher: ['/with-middleware/:path*', '/another-middleware/:path*']
          };
          export default (req) => {
            const res = NextResponse.next();
            res.headers.set('X-From-Middleware', 'true');
            return res;
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('does not add the header for root request', async () => {
    const response = await fetchViaHTTP(next.url, '/')
    expect(response.headers.get('X-From-Middleware')).toBeNull()
    expect(await response.text()).toContain('root page')
  })

  it('adds the header for a matched path', async () => {
    const response = await fetchViaHTTP(next.url, '/with-middleware')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
    expect(await response.text()).toContain('This should run the middleware')
  })

  it('adds the header for a matched data path', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/with-middleware.json`
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello, cruel world.',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('adds the header for another matched path', async () => {
    const response = await fetchViaHTTP(next.url, '/another-middleware')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
    expect(await response.text()).toContain(
      'This should also run the middleware'
    )
  })

  it('adds the header for another matched data path', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/another-middleware.json`
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello, magnificent world.',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('does not add the header for root data request', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/index.json`
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello, world.',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBeNull()
  })
})

describe('using a single matcher', () => {
  let next: NextInstance
  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/[...route].js': `
          export default function Page({ message }) { 
            return <div>
              <p>root page</p>
              <p>{message}</p>
            </div>
          } 

          export const getServerSideProps = ({ params }) => {
            return {
              props: {
                message: "Hello from /" + params.route.join("/")
              }
            }
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server'
          export const config = {
            matcher: '/middleware/works'
          };
          export default (req) => {
            const res = NextResponse.next();
            res.headers.set('X-From-Middleware', 'true');
            return res;
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())
  it('adds the header for a matched path', async () => {
    const response = await fetchViaHTTP(next.url, '/middleware/works')
    expect(await response.text()).toContain('Hello from /middleware/works')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('adds the headers for a matched data path', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/middleware/works.json`
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello from /middleware/works',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('does not add the header for an unmatched path', async () => {
    const response = await fetchViaHTTP(next.url, '/about/me')
    expect(await response.text()).toContain('Hello from /about/me')
    expect(response.headers.get('X-From-Middleware')).toBeNull()
  })
})
