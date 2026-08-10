import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  waitForNoRedbox,
  getRedboxHeader,
  retry,
} from 'next-test-utils'

const reactDependencies = {
  react: '19.3.0-canary-fef12a01-20260413',
  'react-dom': '19.3.0-canary-fef12a01-20260413',
}

const blogIsr = `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getStaticProps() {
        return {
         props: { posts: ["my isr post"] },
         revalidate: 10,
        }
       }`

const blogGspRevalidateFalse = `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getStaticProps() {
        return {
         props: { posts: ["my gsp post"] },
         revalidate: false,
        }
       }`

const blogGspNoRevalidate = `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getStaticProps() {
        return {
         props: { posts: ["my gsp post"] },
        }
       }`

const blogGssp = `export default function Blog({ posts }) {
        return posts.map(p => (<div key={p}>{p}</div>))
       }

       export async function getServerSideProps() {
         return {
           props: { posts: ["my ssr post"] },
         }
       }`

const postsSlug = (fallback: string) =>
  `export default function Post(props) {
        return <h1>Hello from {props.slug}</h1>
       }

       export async function getStaticPaths({ params }) {
         return {
           paths: [
             { params: { slug: 'one' } },
           ],
           fallback: ${fallback},
         }
       }

       export async function getStaticProps({ params }) {
        return {
         props: { slug: params.slug },
        }
       }`

describe('config-output-export', () => {
  describe('static homepage', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
    })

    it('should work with static homepage', async () => {
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        '<div id="__next">Hello World</div>'
      )
    })
  })

  describe('"i18n" config', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'next.config.js': `module.exports = ${JSON.stringify({
          output: 'export',
          i18n: { locales: ['en'], defaultLocale: 'en' },
        })}`,
      },
    })

    it('should error with "i18n" config', async () => {
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'Specified "i18n" cannot be used with "output: export".'
        )
      })
    })
  })

  describe('when hasNextSupport = false', () => {
    describe('"rewrites" config', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies: reactDependencies,
        overrideFiles: {
          'next.config.js': `module.exports = ${JSON.stringify({
            output: 'export',
            rewrites: [{ source: '/from', destination: '/to' }],
          })}`,
        },
      })

      it('should error with "rewrites" config', async () => {
        await retry(async () => {
          expect(next.cliOutput).toContain(
            'Specified "rewrites" will not automatically work with "output: export".'
          )
        })
      })
    })

    describe('"redirects" config', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies: reactDependencies,
        overrideFiles: {
          'next.config.js': `module.exports = ${JSON.stringify({
            output: 'export',
            redirects: [
              { source: '/from', destination: '/to', permanent: true },
            ],
          })}`,
        },
      })

      it('should error with "redirects" config', async () => {
        await retry(async () => {
          expect(next.cliOutput).toContain(
            'Specified "redirects" will not automatically work with "output: export".'
          )
        })
      })
    })

    describe('"headers" config', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies: reactDependencies,
        overrideFiles: {
          'next.config.js': `module.exports = ${JSON.stringify({
            output: 'export',
            headers: [
              {
                source: '/foo',
                headers: [{ key: 'x-foo', value: 'val' }],
              },
            ],
          })}`,
        },
      })

      it('should error with "headers" config', async () => {
        await retry(async () => {
          expect(next.cliOutput).toContain(
            'Specified "headers" will not automatically work with "output: export".'
          )
        })
      })
    })
  })

  describe('api routes function', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/api/wow.js': 'export default (_, res) => res.end("wow")',
      },
    })

    it('should error with api routes function', async () => {
      const response = await next.fetch('/api/wow')
      expect(response.status).toBe(404)
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'API Routes cannot be used with "output: export".'
        )
      })
    })
  })

  describe('middleware function', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'middleware.js':
          'export function middleware(req) { console.log("[mw]",request.url) }',
      },
    })

    it('should error with middleware function', async () => {
      const response = await next.fetch('/api/mw')
      expect(response.status).toBe(404)
      expect(next.cliOutput).not.toContain('[mw]')
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'Middleware cannot be used with "output: export".'
        )
      })
    })
  })

  describe('getStaticProps with revalidate 10 (ISR)', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/blog.js': blogIsr,
      },
    })

    it('should error with getStaticProps and revalidate 10 seconds (ISR)', async () => {
      const browser = await next.browser('/blog')
      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'ISR cannot be used with "output: export".'
      )
      expect(next.cliOutput).toContain(
        'ISR cannot be used with "output: export".'
      )
    })
  })

  describe('getStaticProps with revalidate false', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/blog.js': blogGspRevalidateFalse,
      },
    })

    it('should work with getStaticProps and revalidate false', async () => {
      const browser = await next.browser('/blog')
      await waitForNoRedbox(browser)
    })
  })

  describe('getStaticProps without revalidate', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/blog.js': blogGspNoRevalidate,
      },
    })

    it('should work with getStaticProps and without revalidate', async () => {
      const browser = await next.browser('/blog')
      await waitForNoRedbox(browser)
    })
  })

  describe('getServerSideProps', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/blog.js': blogGssp,
      },
    })

    it('should error with getServerSideProps without fallback', async () => {
      const browser = await next.browser('/blog')
      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'getServerSideProps cannot be used with "output: export".'
      )
      expect(next.cliOutput).toContain(
        'getServerSideProps cannot be used with "output: export".'
      )
    })
  })

  describe('getStaticPaths with fallback true', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/posts/[slug].js': postsSlug('true'),
      },
    })

    it('should error with getStaticPaths and fallback true', async () => {
      const browser = await next.browser('/posts/one')
      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'getStaticPaths with "fallback: true" cannot be used with "output: export".'
      )
      expect(next.cliOutput).toContain(
        'getStaticPaths with "fallback: true" cannot be used with "output: export".'
      )
    })
  })

  describe('getStaticPaths with fallback blocking', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/posts/[slug].js': postsSlug("'blocking'"),
      },
    })

    it('should error with getStaticPaths and fallback blocking', async () => {
      const browser = await next.browser('/posts/one')
      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'getStaticPaths with "fallback: blocking" cannot be used with "output: export".'
      )
      expect(next.cliOutput).toContain(
        'getStaticPaths with "fallback: blocking" cannot be used with "output: export".'
      )
    })
  })

  describe('getStaticPaths with fallback false', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      overrideFiles: {
        'pages/posts/[slug].js': postsSlug('false'),
      },
    })

    it('should work with getStaticPaths and fallback false', async () => {
      const browser = await next.browser('/posts/one')
      const h1 = await browser.elementByCss('h1')
      expect(await h1.text()).toContain('Hello from one')
      await waitForNoRedbox(browser)
    })
  })
})

describe('config-output-export with hasNextSupport', () => {
  describe('"rewrites" config', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      env: { NOW_BUILDER: '1' },
      overrideFiles: {
        'next.config.js': `module.exports = ${JSON.stringify({
          output: 'export',
          rewrites: [{ source: '/from', destination: '/to' }],
        })}`,
      },
    })

    it('should not error with "rewrites" config', async () => {
      expect(next.cliOutput).not.toContain(
        'Specified "rewrites" will not automatically work with "output: export".'
      )
    })
  })

  describe('"redirects" config', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      env: { NOW_BUILDER: '1' },
      overrideFiles: {
        'next.config.js': `module.exports = ${JSON.stringify({
          output: 'export',
          redirects: [{ source: '/from', destination: '/to', permanent: true }],
        })}`,
      },
    })

    it('should not error with "redirects" config', async () => {
      expect(next.cliOutput).not.toContain(
        'Specified "redirects" will not automatically work with "output: export".'
      )
    })
  })

  describe('"headers" config', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: reactDependencies,
      env: { NOW_BUILDER: '1' },
      overrideFiles: {
        'next.config.js': `module.exports = ${JSON.stringify({
          output: 'export',
          headers: [
            {
              source: '/foo',
              headers: [{ key: 'x-foo', value: 'val' }],
            },
          ],
        })}`,
      },
    })

    it('should not error with "headers" config', async () => {
      expect(next.cliOutput).not.toContain(
        'Specified "headers" will not automatically work with "output: export".'
      )
    })
  })
})
