import { nextTestSetup } from 'e2e-utils'

describe('Conflicting SSG paths', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    afterEach(async () => {
      await next.deleteFile('pages')
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
  })
})
