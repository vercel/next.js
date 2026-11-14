import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import { getDistDir, retry } from 'next-test-utils'

// Reads generated types and runs the local TypeScript compiler.
// @force-gate !deploy
describe('typed-routes-validator-metadata-only', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function generateTypes() {
    if (isNextDev) {
      await next.start()
      await next.fetch('/')
    } else {
      await next.build()
    }
  }

  async function expectTypes(expectValidator: (validator: string) => void) {
    try {
      // Dev route types are generated after the server starts.
      await retry(async () => {
        const validator = await next.readFile(
          `${getDistDir()}/types/validator.ts`
        )
        expectValidator(validator)

        const { exitCode, stdout, stderr } = await execa(
          'pnpm',
          ['tsc', '--noEmit'],
          {
            cwd: next.testDir,
            reject: false,
          }
        )
        expect({ exitCode, stdout, stderr }).toEqual({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
      })
    } finally {
      if (isNextDev) {
        await next.stop()
      }
    }
  }

  function expectNoRouteHandlerImports(validator: string) {
    expect(validator).toContain('const handler = {} as typeof import(')
    expect(validator).not.toContain('AppRouteHandlerRoutes')
    expect(validator).not.toContain('NextRequest')
  }

  it('should not import route handler types for metadata routes', async () => {
    await generateTypes()
    await expectTypes(expectNoRouteHandlerImports)
  })

  it('should not import route handler types for JavaScript route handlers', async () => {
    await next.patchFile(
      'app/api/legacy/route.js',
      `export function GET() {
  return Response.json({ ok: true })
}
`
    )

    try {
      await generateTypes()
      await expectTypes(expectNoRouteHandlerImports)
    } finally {
      await next.deleteFile('app/api/legacy/route.js')
    }
  })

  it('should import route handler types for TypeScript route handlers', async () => {
    await next.patchFile(
      'app/api/typed/route.ts',
      `import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  return Response.json({ pathname: request.nextUrl.pathname })
}
`
    )

    try {
      await generateTypes()
      await expectTypes((validator) => {
        expect(validator).toContain('AppRouteHandlerRoutes')
        expect(validator).toContain(
          "import type { NextRequest } from 'next/server.js'"
        )
        expect(validator).toContain('RouteHandlerConfig<"/api/typed">')
      })
    } finally {
      await next.deleteFile('app/api/typed/route.ts')
    }
  })
})
