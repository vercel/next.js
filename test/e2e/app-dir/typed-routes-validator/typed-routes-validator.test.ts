import { nextTestSetup } from 'e2e-utils'
import { getDistDir } from 'next-test-utils'

describe('typed-routes-validator', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should generate route validation correctly', async () => {
    const dts = await next.readFile(`${getDistDir()}/types/validator.ts`)
    // sanity check that dev generation is working
    expect(dts).toContain('const handler = {} as typeof import(')
  })

  if (isNextStart) {
    it('should pass type checking with valid page exports', async () => {
      await next.stop()
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
      await next.stop()
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
      expect(cliOutput).toMatch(
        /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'AppPageConfig</
      )
    })

    it('should pass type checking with valid route handler exports', async () => {
      await next.stop()
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
      await next.stop()
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
      expect(cliOutput).toMatch(
        /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'RouteHandlerConfig</
      )
    })

    it('should fail type checking with invalid route handler params', async () => {
      await next.stop()
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
      expect(cliOutput).toMatch(
        /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'RouteHandlerConfig</
      )
    })

    it('should pass type checking with valid layout exports', async () => {
      await next.stop()
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
      await next.stop()
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
      expect(cliOutput).toMatch(
        /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'LayoutConfig</
      )
    })

    it('should pass type checking with valid API route exports', async () => {
      await next.stop()
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
      await next.stop()
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
      expect(cliOutput).toMatch(
        /Type error: Type 'typeof import\(.*' does not satisfy the constraint 'ApiRouteConfig'/
      )
    })
  }
})
