import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('Middleware validation during build', () => {
  const appDir = join(__dirname, '..')
  const middlewareFile = join(appDir, 'pages', '_middleware.js')
  const middlewareError = 'Your middleware is returning a response body'

  beforeEach(() => fs.remove(join(appDir, '.next')))

  afterEach(() =>
    fs.writeFile(middlewareFile, '// this will be populated by each test')
  )

  describe.each([
    {
      title: 'returning a text body',
      code: `export default function () {
              return new Response('this is not allowed')
            }`,
      failing: true,
    },
    {
      title: 'building body with JSON.stringify',
      code: `export default function () {
              return new Response(JSON.stringify({ error: 'this is not allowed' }))
            }`,
      failing: true,
    },
    {
      title: 'returning a null body',
      code: `export default function () {
              return new Response(null)
            }`,
      failing: false,
    },
    {
      title: 'returning an undefined body',
      code: `export default function () {
              return new Response(undefined)
            }`,
      failing: false,
    },
    {
      title: 'building response body with a variable',
      code: `export default function () {
              const body = 'this is not allowed, but hard to detect with AST'
              return new Response(body)
            }`,
      failing: false,
    },
    {
      title: 'building response body with custom code',
      code: `function buildResponse() {
              return JSON.stringify({ message: 'this is not allowed, but hard to detect with AST' })
            }

            export default function () {
              return new Response(buildResponse())
            }`,
      failing: false,
    },
  ])('given a middleware $title', ({ code, failing }) => {
    beforeAll(() => fs.writeFile(middlewareFile, code))

    it(failing ? 'throws an error' : 'builds successfully', async () => {
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      if (failing) {
        expect(stderr).toMatch(middlewareError)
        expect(code).toBe(1)
      } else {
        expect(stderr).not.toMatch(middlewareError)
        expect(code).toBe(0)
      }
    })
  })
})
