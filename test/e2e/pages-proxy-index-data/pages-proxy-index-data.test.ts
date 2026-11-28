import { nextTestSetup } from 'e2e-utils'

describe('Pages Proxy data URLs for index routes', () => {
  const { next } = nextTestSetup({
    files: {
      'proxy.js': `
        import { NextResponse } from 'next/server'

        export function proxy(request) {
          const response = NextResponse.next()
          response.headers.set('x-proxy-pathname', request.nextUrl.pathname)
          return response
        }
      `,
      'pages/index.js': `
        export const getStaticProps = async () => ({ props: { title: 'home' } })
        export default function Home({ title }) { return <h1>{title}</h1> }
      `,
      'pages/index/index.js': `
        export const getStaticProps = async () => ({ props: { title: 'index page' } })
        export default function Index({ title }) { return <h1>{title}</h1> }
      `,
    },
  })

  it.each([
    ['index', '/', 'home'],
    ['index/index', '/index', 'index page'],
  ])(
    'exposes the route pathname for the %s data URL',
    async (dataPath, pathname, title) => {
      const response = await next.fetch(
        `/_next/data/${next.buildId}/${dataPath}.json`,
        { headers: { 'x-nextjs-data': '1' } }
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('x-proxy-pathname')).toBe(pathname)
      expect(await response.json()).toMatchObject({ pageProps: { title } })
    }
  )
})
