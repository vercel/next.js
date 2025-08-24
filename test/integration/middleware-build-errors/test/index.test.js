import { remove, writeFile } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('Middleware validation during build', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(__dirname, '..')
      const middlewareFile = join(appDir, 'middleware.js')
      const middlewareError = 'Middleware is returning a response body'

      beforeEach(() => remove(join(appDir, '.next')))

      afterEach(() =>
        writeFile(middlewareFile, '// this will be populated by each test\n')
      )

      describe.each([
        {
          title: 'returning a text body',
          code: `export default function () {
              return new Response('this is not allowed')
            }`,
        },
        {
          title: 'building body with JSON.stringify',
          code: `export default function () {
              return new Response(JSON.stringify({ error: 'this is not allowed' }))
            }`,
        },
        {
          title: 'building response body with a variable',
          code: `export default function () {
              const body = 'this is not allowed, but hard to detect with AST'
              return new Response(body)
            }`,
        },
        {
          title: 'building response body with custom code',
          code: `function buildResponse() {
              return JSON.stringify({ message: 'this is not allowed, but hard to detect with AST' })
            }

            export default function () {
              return new Response(buildResponse())
            }`,
        },
        {
          title: 'returning a text body with NextResponse',
          code: `import { NextResponse } from 'next/server'
            export default function () {
              return new NextResponse('this is not allowed')
            }`,
        },
      ])('given a middleware $title', ({ code }) => {
        beforeAll(() => writeFile(middlewareFile, code))

        it('does not throw an error', async () => {
          const { stderr, code } = await nextBuild(appDir, [], {
            stderr: true,
            stdout: true,
          })
          expect(stderr).not.toMatch(middlewareError)
          expect(code).toBe(0)
        })
      })

      describe.each([
        {
          title: 'returning a null body',
          code: `export default function () {
              return new Response(null)
            }`,
        },
        {
          title: 'returning an undefined body',
          code: `export default function () {
              return new Response(undefined)
            }`,
        },
      ])('given a middleware $title', ({ code }) => {
        beforeAll(() => writeFile(middlewareFile, code))

        it('builds successfully', async () => {
          const { stderr, code } = await nextBuild(appDir, [], {
            stderr: true,
            stdout: true,
          })
          expect(stderr).not.toMatch(middlewareError)
          expect(code).toBe(0)
        })
      })
    }
  )
})
