import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import { gate, getDistDir, retry } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely expects a local build failure instead of a successful deployment.
// @force-gate !deploy
describe('typed-routes-validator', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should generate route validation correctly', async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/')
    } else {
      await next.build()
    }

    try {
      const dts = await next.readFile(`${getDistDir()}/types/validator.ts`)
      // sanity check that dev generation is working
      expect(dts).toContain('const handler = {} as typeof import(')
    } finally {
      if (isNextDev) {
        await next.stop()
      }
    }
  })

  it('should have passing tsc after the server generated types', async () => {
    if (isNextDev) {
      await next.start()
    } else {
      await next.build()
    }
    try {
      if (isNextDev) {
        // In dev mode, route types are generated asynchronously after the server starts.
        // Might take a few tries before all the relevant types exist.
        await retry(async () => {
          const { stdout, stderr } = await execa('pnpm', ['tsc', '--noEmit'], {
            cwd: next.testDir,
            reject: false,
          })

          expect({ stdout, stderr }).toEqual({
            stdout: '',
            stderr: '',
          })
        })
      } else {
        const { stdout, stderr } = await execa('pnpm', ['tsc', '--noEmit'], {
          cwd: next.testDir,
          reject: false,
        })

        expect({ stdout, stderr }).toEqual({
          stdout: '',
          stderr: '',
        })
      }
    } finally {
      if (isNextDev) {
        await next.stop()
      }
    }
  })

  // Authored files must update type generation before any request compiles them.
  // @force-gate dev
  describe('development discovery updates', () => {
    // Route observation and type generation can require several polling cycles.
    const discoveryTimeout = 15_000

    beforeEach(async () => {
      await next.start()
    })

    afterEach(async () => {
      await next.stop()
      await next.deleteFile('app/inventory-layout-only')
      await next.deleteFile('app/inventory-renamed')
      await next.deleteFile('app/inventory-metadata')
    })

    it('should add, rename, and remove a layout without an executable page', async () => {
      await next.patchFile(
        'app/inventory-layout-only/layout.tsx',
        'export default function Layout({ children }: { children: React.ReactNode }) { return children }'
      )
      await retry(async () => {
        const validator = await next.readFile(
          `${getDistDir()}/types/validator.ts`
        )
        expect(validator).toContain('app/inventory-layout-only/layout.tsx')
        const routes = await next.readFile(`${getDistDir()}/types/routes.d.ts`)
        expect(routes).toContain('"/inventory-layout-only"')
      }, discoveryTimeout)
      expect((await next.fetch('/inventory-layout-only')).status).toBe(404)

      await next.renameFile(
        'app/inventory-layout-only/layout.tsx',
        'app/inventory-layout-only/layout.ts'
      )
      await retry(async () => {
        const validator = await next.readFile(
          `${getDistDir()}/types/validator.ts`
        )
        expect(validator).toContain('app/inventory-layout-only/layout.ts')
        expect(validator).not.toContain('app/inventory-layout-only/layout.tsx')
      }, discoveryTimeout)

      await next.deleteFile('app/inventory-layout-only/layout.ts')
      await retry(async () => {
        const validator = await next.readFile(
          `${getDistDir()}/types/validator.ts`
        )
        expect(validator).not.toContain('app/inventory-layout-only/layout')
        const routes = await next.readFile(`${getDistDir()}/types/routes.d.ts`)
        expect(routes).not.toContain('"/inventory-layout-only"')
      }, discoveryTimeout)
    })

    it('should update metadata route types when generator exports change', async () => {
      await next.patchFile(
        'app/inventory-metadata/sitemap.ts',
        'export default function sitemap() { return [] }'
      )
      await retry(async () => {
        const routes = await next.readFile(`${getDistDir()}/types/routes.d.ts`)
        expect(routes).toContain('"/inventory-metadata/sitemap.xml"')
      }, discoveryTimeout)
      await next.patchFile(
        'app/inventory-metadata/sitemap.ts',
        `export function generateSitemaps() { return [{ id: 0 }] }
         export default function sitemap() { return [] }`
      )
      await retry(async () => {
        const routes = await next.readFile(`${getDistDir()}/types/routes.d.ts`)
        expect(routes).toContain(
          '"/inventory-metadata/sitemap/[__metadata_id__]"'
        )
        expect(routes).not.toContain('"/inventory-metadata/sitemap.xml"')
      }, discoveryTimeout)
    })

    it('should update validators when a route keeps its URL but changes source extension', async () => {
      await next.patchFile(
        'app/inventory-renamed/page.tsx',
        'export default function Page() { return "same route" }'
      )
      await retry(async () => {
        const routes = await next.readFile(`${getDistDir()}/types/routes.d.ts`)
        expect(routes).toContain('"/inventory-renamed"')
      }, discoveryTimeout)
      await next.renameFile(
        'app/inventory-renamed/page.tsx',
        'app/inventory-renamed/page.ts'
      )
      await retry(async () => {
        const validator = await next.readFile(
          `${getDistDir()}/types/validator.ts`
        )
        expect(validator).toContain('app/inventory-renamed/page.ts\n')
        expect(validator).not.toContain('app/inventory-renamed/page.tsx')
      }, discoveryTimeout)
      expect(await next.render('/inventory-renamed')).toContain('same route')
    })
  })

  // Type validation here explicitly runs local production builds.
  // @force-gate start
  describe('production mode', () => {
    it('should pass type checking with valid page exports', async () => {
      await next.patchFile(
        'app/test-page.tsx',
        `
    export default function TestPage() {
      return <div>Test Page</div>
    }

    export const dynamic = 'force-static'
    export const metadata = { title: 'Test' }
            `
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should fail type checking with invalid page exports', async () => {
      await next.patchFile(
        'app/invalid/page.tsx',
        `
    // Missing default export
    export const metadata = { title: 'Invalid' }
            `
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up before assertion just in case it fails
      await next.deleteFile('app/invalid/page.tsx')

      expect(exitCode).toBe(1)
      if (await gate('strictRouteTypes')) {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the expected type 'AppPageConfig</
        )
      } else {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'AppPageConfig</
        )
      }
    })

    it('should pass type checking with valid page props', async () => {
      await next.patchFile(
        'app/valid/[id]/page.tsx',
        `
    export default function ValidPage(props: { params: Promise<{ id: string }> }) {
      return <div>Valid Page</div>
    }
            `
      )

      const { exitCode } = await next.build()
      // clean up before assertion just in case it fails
      await next.deleteFile('app/valid/[id]/page.tsx')

      expect(exitCode).toBe(0)
    })

    it('should fail type checking with invalid page props', async () => {
      await next.patchFile(
        'app/invalid/page.tsx',
        `
    export default function InvalidPage(props: { invalidProp: string }) {
      return <div>Invalid Page</div>
    }
            `
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up before assertion just in case it fails
      await next.deleteFile('app/invalid/page.tsx')

      expect(exitCode).toBe(1)
      if (await gate('strictRouteTypes')) {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the expected type 'AppPageConfig</
        )
      } else {
        // Non-strict AppPageConfig accepts any props. The per-page type check
        // rejects invalid props instead.
        expect(cliOutput.replace(/\\/g, '/')).toContain(
          'Type error: Page "app/invalid/page.tsx" has an invalid "default" export:'
        )
        expect(cliOutput).toContain(
          'Type "{ invalidProp: string; }" is not valid.'
        )
      }
    })

    it('should pass type checking with valid route handler exports', async () => {
      await next.patchFile(
        'app/valid/route.ts',
        `
    export async function GET() {
      return new Response('OK')
    }

    export async function POST(request: Request) {
      return new Response('Created', { status: 201 })
    }

    export const dynamic = 'force-dynamic'
            `
      )

      await next.patchFile(
        'app/valid-2/route.ts',
        `
    import type { NextRequest } from 'next/server'

    export async function GET() {
      return new Response('OK')
    }

    export async function POST(request: NextRequest) {
      return new Response('Created', { status: 201 })
    }

    export const dynamic = 'force-dynamic'
            `
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should fail type checking with invalid route handler return type', async () => {
      await next.patchFile(
        'app/invalid/route.ts',
        `
    // Invalid signature - missing Response return type
    export function GET() {
      return 'not a response'
    }
            `
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up before assertion just in case it fails
      await next.deleteFile('app/invalid/route.ts')

      expect(exitCode).toBe(1)
      if (await gate('strictRouteTypes')) {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the expected type 'RouteHandlerConfig</
        )
      } else {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'RouteHandlerConfig</
        )
      }
    })

    it('should fail type checking with invalid route handler params', async () => {
      await next.patchFile(
        'app/invalid-2/route.ts',
        `
    // not a valid type for request
    export async function POST(request: number) {
      return new Response('Created', { status: 201 })
    }
            `
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up before assertion just in case it fails
      await next.deleteFile('app/invalid-2/route.ts')

      expect(exitCode).toBe(1)
      if (await gate('strictRouteTypes')) {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the expected type 'RouteHandlerConfig</
        )
      } else {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'RouteHandlerConfig</
        )
      }
    })

    it('should pass type checking with valid layout exports', async () => {
      await next.patchFile(
        'app/test/layout.tsx',
        `
        export default function TestLayout({
          children,
        }: {
          children: React.ReactNode
        }) {
          return <div>{children}</div>
        }

        export const metadata = { title: 'Test Layout' }
                `
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should fail type checking with invalid layout exports', async () => {
      await next.patchFile(
        'app/invalid/layout.tsx',
        `
    // Invalid - doesn't return a React node
    export default function InvalidLayout() {
      return {randomKey: 'randomValue'}
    }
            `
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up before assertion just in case it fails
      await next.deleteFile('app/invalid/layout.tsx')

      expect(exitCode).toBe(1)
      if (await gate('strictRouteTypes')) {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the expected type 'LayoutConfig</
        )
      } else {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'LayoutConfig</
        )
      }
    })

    it('should pass type checking with valid API route exports', async () => {
      await next.patchFile(
        'pages/api/valid-api.ts',
        `
    import type { NextApiRequest, NextApiResponse } from 'next'

    export default function handler(
      req: NextApiRequest,
      res: NextApiResponse
    ) {
      res.status(200).json({ message: 'OK' })
    }

    export const config = {
      api: {
        bodyParser: true,
      },
    }
            `
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should fail type checking with invalid API route exports', async () => {
      await next.patchFile(
        'pages/api/invalid-api.ts',
        `
    // Invalid - not a function
    export default { message: 'not a function' }
            `
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up before assertion just in case it fails
      await next.deleteFile('pages/api/invalid-api.ts')

      expect(exitCode).toBe(1)
      if (await gate('strictRouteTypes')) {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the expected type 'ApiRouteConfig'/
        )
      } else {
        expect(cliOutput).toMatch(
          /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'ApiRouteConfig'/
        )
      }
    })
  })
})
