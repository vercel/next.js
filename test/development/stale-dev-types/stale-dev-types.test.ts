import { join } from 'path'
import execa from 'execa'
import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { retry, runNextCommand } from 'next-test-utils'

// The fixture lives in its own directory so this test file is not copied into
// the app, where `tsc` would type-check it.
const FIXTURE_DIR = join(__dirname, 'fixture')
const DEV_VALIDATOR = '.next/dev/types/validator.ts'

async function waitForDevValidator(
  next: NextInstance,
  route: string,
  expected: string,
  validator = DEV_VALIDATOR
) {
  // Compile the route so bundler-specific dev types are generated too.
  expect((await next.fetch(route)).status).toBe(200)
  await retry(
    async () => {
      const content = await next.readFile(validator).catch(() => '')
      expect(content).toContain(expected)
    },
    5000,
    500
  )
}

async function runTypegen(next: NextInstance) {
  const { code, stdout, stderr } = await runNextCommand(
    ['typegen', next.testDir],
    { stdout: true, stderr: true }
  )
  expect({ code, output: stdout + stderr }).toMatchObject({ code: 0 })
}

async function runTsc(next: NextInstance) {
  const result = await execa('pnpm', ['tsc', '--noEmit'], {
    cwd: next.testDir,
    reject: false,
  })
  return {
    exitCode: result.exitCode,
    output: `${result.stdout}${result.stderr}`,
  }
}

async function moveBeforeRouteToAfter(next: NextInstance) {
  const layout = await next.readFile('app/before/layout.tsx')
  const page = await next.readFile('app/before/page.tsx')
  await next.patchFile(
    'app/after/layout.tsx',
    layout.replaceAll("'/before'", "'/after'")
  )
  await next.patchFile('app/after/page.tsx', page)
  await next.deleteFile('app/before')
}

describe('stale-dev-types', () => {
  describe('next build with the TypeScript API', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
      nextConfig: {
        experimental: {
          useTypeScriptCli: false,
        },
      },
    })

    it('should not fail build when .next/dev has stale types from deleted routes', async () => {
      // Step 1: Wait for dev server to generate .next/dev/types/validator.ts
      // that references temp-route
      await waitForDevValidator(next, '/temp-route', 'temp-route/page')

      // Step 2: Stop dev server
      await next.stop()

      // Step 3: Delete the temp-route (simulating user deleting a route)
      await next.deleteFile('app/temp-route/page.tsx')

      // Verify .next/dev/types/validator.ts still references deleted route (stale)
      const staleValidator = await next.readFile(DEV_VALIDATOR)
      expect(staleValidator).toContain('temp-route/page')

      // Step 4: Run build - should NOT fail due to stale .next/dev types
      const { exitCode, cliOutput } = await next.build()

      // Build should succeed - stale dev types should be excluded from type checking
      expect(cliOutput).not.toContain(
        "Cannot find module '../../../app/temp-route/page"
      )
      expect(exitCode).toBe(0)
    })
  })

  describe('next build with the TypeScript CLI', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should not fail build when .next/dev has stale types from deleted routes', async () => {
      await waitForDevValidator(next, '/temp-route', 'temp-route/page')
      await next.stop()
      await next.deleteFile('app/temp-route/page.tsx')

      // The TypeScript CLI checks every file the tsconfig includes, so the
      // stale .next/dev/types must be pruned before type checking.
      const { exitCode, cliOutput } = await next.build()

      expect(cliOutput).not.toContain(
        "Cannot find module '../../../app/temp-route/page"
      )
      expect(exitCode).toBe(0)
      expect(await next.hasFile('.next/dev/types')).toBe(false)
      expect(await next.hasFile('.next/dev')).toBe(true)
    })
  })

  describe('next build with a custom export distDir', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
      nextConfig: {
        output: 'export',
        distDir: 'custom-out',
      },
    })

    it('should remove the dev types below the configured distDir', async () => {
      const validator = 'custom-out/dev/types/validator.ts'
      await waitForDevValidator(
        next,
        '/temp-route',
        'temp-route/page',
        validator
      )
      await next.stop()
      await next.deleteFile('app/temp-route/page.tsx')

      // With a custom export distDir, build artifacts are written to .next
      // while `next dev` writes its types below the configured distDir.
      const { exitCode, cliOutput } = await next.build()

      expect(cliOutput).not.toContain(
        "Cannot find module '../../../app/temp-route/page"
      )
      expect(exitCode).toBe(0)
      expect(await next.hasFile('custom-out/dev/types')).toBe(false)
    })
  })

  describe('next typegen after moving a route', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should not leave stale dev types that fail type checking', async () => {
      await waitForDevValidator(next, '/before', 'before/layout')
      await next.stop()

      // Prints the TypeScript output on failure.
      expect(await runTsc(next)).toEqual({
        exitCode: 0,
        output: expect.any(String),
      })

      await moveBeforeRouteToAfter(next)
      await runTypegen(next)

      const { exitCode, output } = await runTsc(next)
      expect(output).not.toContain('app/before/')
      expect(output).not.toContain('TS2307')
      expect(output).not.toContain('TS2344')
      expect(exitCode).toBe(0)
    })
  })

  describe('next typegen after deleting a route', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should not leave stale dev types that fail type checking', async () => {
      await waitForDevValidator(next, '/temp-route', 'temp-route/page')
      await next.stop()
      await next.deleteFile('app/temp-route/page.tsx')

      await runTypegen(next)

      const { exitCode, output } = await runTsc(next)
      expect(output).not.toContain('app/temp-route/page')
      expect(output).not.toContain('TS2307')
      expect(exitCode).toBe(0)
    })
  })

  describe('next typegen while next dev is running', () => {
    const { next } = nextTestSetup({
      files: FIXTURE_DIR,
    })

    it('should keep the dev types of the running dev server', async () => {
      await waitForDevValidator(next, '/temp-route', 'temp-route/page')

      await runTypegen(next)

      // The running dev server owns .next/dev/types and keeps them up to date.
      expect(await next.readFile(DEV_VALIDATOR)).toContain('temp-route/page')
    })
  })
})
