import { nextTestSetup } from 'e2e-utils'

describe('Conflicting SSG paths', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    afterEach(async () => {
      await next.deleteFile('pages')
      await next.deleteFile('app')
    })

    it('should show proper error when two dynamic SSG routes have conflicting paths', async () => {
      await next.patchFile(
        'pages/blog/[slug].js',
        `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/blog/conflicting',
            '/blog/first'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/blog/[slug]'
      }
    `
      )

      await next.patchFile(
        'pages/[...catchAll].js',
        `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/blog/conflicting',
            '/hello/world'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/[catchAll]'
      }
    `
      )

      await next.build()
      expect(next.cliOutput).toContain(
        'Conflicting paths returned from getStaticPaths, paths must be unique per page'
      )
      expect(next.cliOutput).toContain(
        'https://nextjs.org/docs/messages/conflicting-ssg-paths'
      )
      expect(next.cliOutput).toContain(
        `path: "/blog/conflicting" from page: "/[...catchAll]"`
      )
      expect(next.cliOutput).toContain(
        `conflicts with path: "/blog/conflicting"`
      )
    })

    it('should show proper error when a dynamic SSG route conflicts with normal route', async () => {
      await next.patchFile(
        'pages/hello/world.js',
        `
      export default function Page() {
        return '/hello/world'
      }
    `
      )

      await next.patchFile(
        'pages/[...catchAll].js',
        `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/hello',
            '/hellO/world'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/[catchAll]'
      }
    `
      )

      await next.build()
      expect(next.cliOutput).toContain(
        'Conflicting paths returned from getStaticPaths, paths must be unique per page'
      )
      expect(next.cliOutput).toContain(
        'https://nextjs.org/docs/messages/conflicting-ssg-paths'
      )
      expect(next.cliOutput).toContain(
        `path: "/hellO/world" from page: "/[...catchAll]" conflicts with path: "/hello/world"`
      )
    })

    it('should show proper error when a dynamic SSG route conflicts with SSR route', async () => {
      await next.patchFile(
        'pages/hello/world.js',
        `
      export const getServerSideProps = () => ({ props: {} })

      export default function Page() {
        return '/hello/world'
      }
    `
      )

      await next.patchFile(
        'pages/[...catchAll].js',
        `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/hello',
            '/hellO/world'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/[catchAll]'
      }
    `
      )

      await next.build()
      expect(next.cliOutput).toContain(
        'Conflicting paths returned from getStaticPaths, paths must be unique per page'
      )
      expect(next.cliOutput).toContain(
        'https://nextjs.org/docs/messages/conflicting-ssg-paths'
      )
      expect(next.cliOutput).toContain(
        `path: "/hellO/world" from page: "/[...catchAll]" conflicts with path: "/hello/world"`
      )
    })

    it('should show proper error when App Router dynamic SSG route conflicts with normal route', async () => {
      await next.patchFile(
        'app/blog/page.js',
        `
        export default function Page() {
          return 'Static /blog'
        }
      `
      )

      await next.patchFile(
        'app/[[...path]]/page.js',
        `
        export async function generateStaticParams() {
          return [{ path: ['blog'] }]
        }

        export default function Page() {
          return 'Catch-all'
        }
      `
      )

      await next.build()
      expect(next.cliOutput).toContain(
        'Conflicting paths returned from generateStaticParams, paths must be unique per page'
      )
      expect(next.cliOutput).toContain(
        'https://nextjs.org/docs/messages/conflicting-ssg-paths'
      )
      expect(next.cliOutput).toContain(
        'path: "/blog" from page: "/[[...path]]" conflicts with path: "/blog"'
      )
    })

    it('should show proper error when two App Router dynamic SSG routes have conflicting paths', async () => {
      await next.patchFile(
        'app/blog/[slug]/page.js',
        `
        export async function generateStaticParams() {
          return [{ slug: 'conflicting' }, { slug: 'first' }]
        }

        export default function Page() {
          return 'Blog'
        }
      `
      )

      await next.patchFile(
        'app/[...catchAll]/page.js',
        `
        export async function generateStaticParams() {
          return [
            { catchAll: ['blog', 'conflicting'] },
            { catchAll: ['hello', 'world'] },
          ]
        }

        export default function Page() {
          return 'CatchAll'
        }
      `
      )

      await next.build()
      expect(next.cliOutput).toContain(
        'Conflicting paths returned from generateStaticParams, paths must be unique per page'
      )
      expect(next.cliOutput).toContain(
        'https://nextjs.org/docs/messages/conflicting-ssg-paths'
      )
      expect(next.cliOutput).toContain('path: "/blog/conflicting"')
      expect(next.cliOutput).toContain('conflicts with')
    })
  })
})
