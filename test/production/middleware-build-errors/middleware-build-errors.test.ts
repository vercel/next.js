import { nextTestSetup } from 'e2e-utils'

describe('Middleware validation during build', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    const middlewareError = 'Middleware is returning a response body'

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
      it('does not throw an error', async () => {
        await next.patchFile('middleware.js', code)
        const { exitCode } = await next.build()
        expect(next.cliOutput).not.toMatch(middlewareError)
        expect(exitCode).toBe(0)
        await next.patchFile(
          'middleware.js',
          '// this will be populated by each test\n'
        )
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
      it('builds successfully', async () => {
        await next.patchFile('middleware.js', code)
        const { exitCode } = await next.build()
        expect(next.cliOutput).not.toMatch(middlewareError)
        expect(exitCode).toBe(0)
        await next.patchFile(
          'middleware.js',
          '// this will be populated by each test\n'
        )
      })
    })
  })
})
