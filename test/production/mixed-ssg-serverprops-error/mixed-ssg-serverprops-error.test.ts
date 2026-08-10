/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { SERVER_PROPS_SSG_CONFLICT } from 'next/dist/lib/constants'

describe('Mixed getStaticProps and getServerSideProps error', () => {
  describe('production mode', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) {
      return
    }

    // Uses Babel, not supported in Turbopack.
    ;(isTurbopack ? it.skip : it)(
      'should error with getStaticProps but no default export',
      async () => {
        await next.patchFile('.babelrc', '{ "presets": ["next/babel"] }')
        const originalContent = await next.readFile('pages/index.js')
        await next.patchFile(
          'pages/index.js',
          `
      export function getStaticProps() {
        return {
          props: {}
        }
      }
    `
        )
        await next.build()
        expect(next.cliOutput).toContain(
          'found page without a React Component as default export in'
        )
        await next.patchFile('pages/index.js', originalContent)
        await next.deleteFile('.babelrc')
      }
    )

    // Uses Babel, not supported in Turbopack.
    ;(isTurbopack ? it.skip : it)(
      'should error when exporting both getStaticProps and getServerSideProps',
      async () => {
        await next.patchFile('.babelrc', '{ "presets": ["next/babel"] }')
        await next.build()
        expect(next.cliOutput).toContain(SERVER_PROPS_SSG_CONFLICT)
        await next.deleteFile('.babelrc')
      }
    )

    // Uses Babel, not supported in Turbopack.
    ;(isTurbopack ? it.skip : it)(
      'should error when exporting both getStaticPaths and getServerSideProps',
      async () => {
        await next.patchFile('.babelrc', '{ "presets": ["next/babel"] }')
        const originalContent = await next.readFile('pages/index.js')
        await next.patchFile(
          'pages/index.js',
          `
      export const getStaticPaths = async () => {
        return {
          props: { world: 'world' }, fallback: true
        }
      }

      export const getServerSideProps = async () => {
        return {
          props: { world: 'world' }
        }
      }

      export default ({ world }) => <p>Hello {world}</p>
    `
        )
        const { exitCode } = await next.build()
        expect(exitCode).toBe(1)
        expect(next.cliOutput).toContain(SERVER_PROPS_SSG_CONFLICT)
        await next.patchFile('pages/index.js', originalContent)
        await next.deleteFile('.babelrc')
      }
    )

    it('should error when exporting getStaticPaths on a non-dynamic page', async () => {
      const originalContent = await next.readFile('pages/index.js')
      await next.patchFile(
        'pages/index.js',
        `
      export const getStaticPaths = async () => {
        return {
          props: { world: 'world' }, fallback: true
        }
      }

      export default ({ world }) => <p>Hello {world}</p>
    `
      )
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(next.cliOutput).toContain(
        "getStaticPaths is only allowed for dynamic SSG pages and was found on '/'."
      )
      await next.patchFile('pages/index.js', originalContent)
    })
  })
})
