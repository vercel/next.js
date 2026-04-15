import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  waitForNoRedbox,
  getRedboxHeader,
  retry,
} from 'next-test-utils'

const originalConfig = `// prettier-ignore
module.exports = {
  output: 'export',
}
`

describe('config-output-export', () => {
  const { next } = nextTestSetup({ files: __dirname })

  afterEach(async () => {
    await next.patchFile('next.config.js', originalConfig)
    await next.deleteFile('pages/api/wow.js').catch(() => {})
    await next.deleteFile('middleware.js').catch(() => {})
    await next.deleteFile('pages/blog.js').catch(() => {})
    await next.deleteFile('pages/posts/[slug].js').catch(() => {})
  })

  it('should work with static homepage', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(
      '<div id="__next">Hello World</div>'
    )
  })

  it('should error with "i18n" config', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify({
        output: 'export',
        i18n: { locales: ['en'], defaultLocale: 'en' },
      })}`
    )
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'Specified "i18n" cannot be used with "output: export".'
      )
    })
  })

  describe('when hasNextSupport = false', () => {
    it('should error with "rewrites" config', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify({
          output: 'export',
          rewrites: [{ source: '/from', destination: '/to' }],
        })}`
      )
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'Specified "rewrites" will not automatically work with "output: export".'
        )
      })
    })

    it('should error with "redirects" config', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify({
          output: 'export',
          redirects: [{ source: '/from', destination: '/to', permanent: true }],
        })}`
      )
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'Specified "redirects" will not automatically work with "output: export".'
        )
      })
    })

    it('should error with "headers" config', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify({
          output: 'export',
          headers: [
            {
              source: '/foo',
              headers: [{ key: 'x-foo', value: 'val' }],
            },
          ],
        })}`
      )
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'Specified "headers" will not automatically work with "output: export".'
        )
      })
    })
  })

  it('should error with api routes function', async () => {
    await next.patchFile(
      'pages/api/wow.js',
      'export default (_, res) => res.end("wow")'
    )
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'API Routes cannot be used with "output: export".'
      )
    })
    const response = await next.fetch('/api/wow')
    expect(response.status).toBe(404)
  })

  it('should error with middleware function', async () => {
    await next.patchFile(
      'middleware.js',
      'export function middleware(req) { console.log("[mw]",request.url) }'
    )
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'Middleware cannot be used with "output: export".'
      )
    })
    const response = await next.fetch('/api/mw')
    expect(response.status).toBe(404)
    expect(next.cliOutput).not.toContain('[mw]')
  })

  it('should error with getStaticProps and revalidate 10 seconds (ISR)', async () => {
    await next.patchFile(
      'pages/blog.js',
      `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getStaticProps() {
        return {
         props: { posts: ["my isr post"] },
         revalidate: 10,
        }
       }`
    )
    const browser = await next.browser('/blog')
    await waitForRedbox(browser)
    expect(await getRedboxHeader(browser)).toContain(
      'ISR cannot be used with "output: export".'
    )
    expect(next.cliOutput).toContain(
      'ISR cannot be used with "output: export".'
    )
  })

  it('should work with getStaticProps and revalidate false', async () => {
    await next.patchFile(
      'pages/blog.js',
      `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getStaticProps() {
        return {
         props: { posts: ["my gsp post"] },
         revalidate: false,
        }
       }`
    )
    const browser = await next.browser('/blog')
    await waitForNoRedbox(browser)
  })

  it('should work with getStaticProps and without revalidate', async () => {
    await next.patchFile(
      'pages/blog.js',
      `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getStaticProps() {
        return {
         props: { posts: ["my gsp post"] },
        }
       }`
    )
    const browser = await next.browser('/blog')
    await waitForNoRedbox(browser)
  })

  it('should error with getServerSideProps without fallback', async () => {
    await next.patchFile(
      'pages/blog.js',
      `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getServerSideProps() {
        return {
          props: { posts: ["my ssr post"] },
        }
       }`
    )
    const browser = await next.browser('/blog')
    await waitForRedbox(browser)
    expect(await getRedboxHeader(browser)).toContain(
      'getServerSideProps cannot be used with "output: export".'
    )
    expect(next.cliOutput).toContain(
      'getServerSideProps cannot be used with "output: export".'
    )
  })

  it('should error with getStaticPaths and fallback true', async () => {
    await next.patchFile(
      'pages/posts/[slug].js',
      `export default function Post(props) {
        return <h1>Hello from {props.slug}</h1>
       }

       export async function getStaticPaths({ params }) {
        return {
          paths: [
            { params: { slug: 'one' } },
          ],
          fallback: true,
        }
       }

       export async function getStaticProps({ params }) {
        return {
         props: { slug: params.slug },
        }
       }`
    )
    const browser = await next.browser('/posts/one')
    await waitForRedbox(browser)
    expect(await getRedboxHeader(browser)).toContain(
      'getStaticPaths with "fallback: true" cannot be used with "output: export".'
    )
    expect(next.cliOutput).toContain(
      'getStaticPaths with "fallback: true" cannot be used with "output: export".'
    )
  })

  it('should error with getStaticPaths and fallback blocking', async () => {
    await next.patchFile(
      'pages/posts/[slug].js',
      `export default function Post(props) {
        return <h1>Hello from {props.slug}</h1>
       }

       export async function getStaticPaths({ params }) {
        return {
          paths: [
            { params: { slug: 'one' } },
          ],
          fallback: 'blocking',
        }
       }

       export async function getStaticProps({ params }) {
        return {
         props: { slug: params.slug },
        }
       }`
    )
    const browser = await next.browser('/posts/one')
    await waitForRedbox(browser)
    expect(await getRedboxHeader(browser)).toContain(
      'getStaticPaths with "fallback: blocking" cannot be used with "output: export".'
    )
    expect(next.cliOutput).toContain(
      'getStaticPaths with "fallback: blocking" cannot be used with "output: export".'
    )
  })

  it('should work with getStaticPaths and fallback false', async () => {
    await next.patchFile(
      'pages/posts/[slug].js',
      `export default function Post(props) {
        return <h1>Hello from {props.slug}</h1>
       }

       export async function getStaticPaths({ params }) {
        return {
          paths: [
            { params: { slug: 'one' } },
          ],
          fallback: false,
        }
       }

       export async function getStaticProps({ params }) {
        return {
         props: { slug: params.slug },
        }
       }`
    )
    const browser = await next.browser('/posts/one')
    const h1 = await browser.elementByCss('h1')
    expect(await h1.text()).toContain('Hello from one')
    await waitForNoRedbox(browser)
  })
})

describe('config-output-export with hasNextSupport', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { NOW_BUILDER: '1' },
  })

  afterEach(async () => {
    await next.patchFile('next.config.js', originalConfig)
  })

  it('should not error with "rewrites" config', async () => {
    const outputIndex = next.cliOutput.length
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify({
        output: 'export',
        rewrites: [{ source: '/from', destination: '/to' }],
      })}`
    )
    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain('Ready')
    })
    expect(next.cliOutput).not.toContain(
      'Specified "rewrites" will not automatically work with "output: export".'
    )
  })

  it('should not error with "redirects" config', async () => {
    const outputIndex = next.cliOutput.length
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify({
        output: 'export',
        redirects: [{ source: '/from', destination: '/to', permanent: true }],
      })}`
    )
    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain('Ready')
    })
    expect(next.cliOutput).not.toContain(
      'Specified "redirects" will not automatically work with "output: export".'
    )
  })

  it('should not error with "headers" config', async () => {
    const outputIndex = next.cliOutput.length
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify({
        output: 'export',
        headers: [
          {
            source: '/foo',
            headers: [{ key: 'x-foo', value: 'val' }],
          },
        ],
      })}`
    )
    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain('Ready')
    })
    expect(next.cliOutput).not.toContain(
      'Specified "headers" will not automatically work with "output: export".'
    )
  })
})
