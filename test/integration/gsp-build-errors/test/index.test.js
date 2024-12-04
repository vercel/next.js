/* eslint-env jest */

import fs from 'fs-extra'
import { dirname, join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
const pagesDir = join(appDir, 'pages')

const writePage = async (content, testPage = join(pagesDir, 'test.js')) => {
  await fs.ensureDir(dirname(testPage))
  await fs.writeFile(testPage, content)
}

describe('GSP build errors', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterEach(() => fs.remove(pagesDir))
      ;(process.env.TURBOPACK ? it.skip : it)(
        'should fail build from module not found',
        async () => {
          await writePage(`
      __non_webpack_require__('a-cool-module')

      export function getStaticProps() {
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `)
          const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
          // eslint-disable-next-line jest/no-standalone-expect
          expect(code).toBe(1)
          // eslint-disable-next-line jest/no-standalone-expect
          expect(stderr).toContain('a-cool-module')
        }
      )

      it('should fail build from ENOENT in getStaticProps', async () => {
        await writePage(`

      export function getStaticProps() {
        require('fs').readFileSync('a-cool-file')
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `)
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(code).toBe(1)
        expect(stderr).toContain('a-cool-file')
      })

      it('should fail build on normal error in getStaticProps', async () => {
        await writePage(`
      export function getStaticProps() {
        throw new Error('a cool error')
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `)
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(code).toBe(1)
        expect(stderr).toContain('a cool error')
      })

      it('should fail build from undefined error in getStaticProps', async () => {
        await writePage(`
      export function getStaticProps() {
        throw undefined
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `)
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(code).toBe(1)
        expect(stderr).toContain('undefined')
      })

      it('should fail build from string error in getStaticProps', async () => {
        await writePage(`
      export function getStaticProps() {
        throw 'a string error'
        return {
          props: {}
        }
      }

      export default function () {
        return null
      }
    `)
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(code).toBe(1)
        expect(stderr).toContain('a string error')
      })

      it('should handle non-serializable error in getStaticProps', async () => {
        await writePage(`
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
    `)
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(code).toBe(1)
        expect(stderr).toContain('my custom error')
      })

      it('should handle non-serializable error in getStaticPaths', async () => {
        await writePage(
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
    `,
          join(pagesDir, '[slug].js')
        )
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(code).toBe(1)
        expect(stderr).toContain('my custom error')
      })
    }
  )
})
