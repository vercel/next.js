/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

describe('GSP build errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  ;(isTurbopack ? it.skip : it)(
    'should fail build from module not found',
    async () => {
      await next.patchFile(
        'pages/test.js',
        `
      __non_webpack_require__('a-cool-module')

      export function getStaticProps() {
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `
      )
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain('a-cool-module')
    }
  )

  it('should fail build from ENOENT in getStaticProps', async () => {
    await next.patchFile(
      'pages/test.js',
      `
      export function getStaticProps() {
        require('fs').readFileSync('a-cool-file')
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain('a-cool-file')
  })

  it('should fail build on normal error in getStaticProps', async () => {
    await next.patchFile(
      'pages/test.js',
      `
      export function getStaticProps() {
        throw new Error('a cool error')
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain('a cool error')
  })

  it('should fail build from undefined error in getStaticProps', async () => {
    await next.patchFile(
      'pages/test.js',
      `
      export function getStaticProps() {
        throw undefined
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain('undefined')
  })

  it('should fail build from string error in getStaticProps', async () => {
    await next.patchFile(
      'pages/test.js',
      `
      export function getStaticProps() {
        throw 'a string error'
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain('a string error')
  })

  it('should handle non-serializable error in getStaticProps', async () => {
    await next.patchFile(
      'pages/test.js',
      `
      export function getStaticProps() {
        const err = new Error('my custom error')
        err.hello = 'world'
        err.a = [1,2,3]
        err.original = err
        err.b = err.a

        throw err

        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain('my custom error')
  })

  it('should handle non-serializable error in getStaticPaths', async () => {
    await next.patchFile(
      'pages/[slug].js',
      `
      export function getStaticProps() {
        return {
          props: {}
        }
      }

      export function getStaticPaths() {
        const err = new Error('my custom error')
        err.hello = 'world'
        err.a = [1,2,3]
        err.original = err
        err.b = err.a

        throw err

        return {
          paths: [],
          fallback: true
        }
      }

      export default function () {
        return null
      }
    `
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain('my custom error')
  })
})
