import { nextTestSetup } from 'e2e-utils'
import { retry, runNextCommand } from 'next-test-utils'
import execa from 'execa'

describe('stale-dev-types', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      experimental: {
        useTypeScriptCli: false,
      },
      cacheLife: {
        custom: {
          stale: 300,
          revalidate: 900,
          expire: 86400,
        },
      },
    },
  })

  it('should not fail type check due to duplicate declarations when both dev and production types exist with skipLibCheck disabled (#91895)', async () => {
    // Step 1: Generate production/typegen declarations
    const typegenResult = await runNextCommand(['typegen', next.testDir], {
      cwd: next.testDir,
      stdout: true,
      stderr: true,
    })
    expect(typegenResult.code).toBe(0)

    // Step 2: Run or trigger development-generated declarations
    await retry(
      async () => {
        const hasDevRoutes = await next
          .readFile('.next/dev/types/routes.d.ts')
          .then(() => true)
          .catch(() => false)
        if (!hasDevRoutes) {
          throw new Error('dev routes.d.ts not generated yet')
        }
      },
      10000,
      500
    )

    // Step 3: Ensure both generated type locations exist as required to reproduce the bug
    const hasProdRoutes = await next
      .readFile('.next/types/routes.d.ts')
      .then(() => true)
      .catch(() => false)
    const hasDevRoutes = await next
      .readFile('.next/dev/types/routes.d.ts')
      .then(() => true)
      .catch(() => false)
    const hasProdCacheLife = await next
      .readFile('.next/types/cache-life.d.ts')
      .then(() => true)
      .catch(() => false)
    const hasDevCacheLife = await next
      .readFile('.next/dev/types/cache-life.d.ts')
      .then(() => true)
      .catch(() => false)
    expect(hasProdRoutes).toBe(true)
    expect(hasDevRoutes).toBe(true)
    expect(hasProdCacheLife).toBe(true)
    expect(hasDevCacheLife).toBe(true)

    // Step 4: Run TypeScript with skipLibCheck disabled
    const originalTsconfig = await next.readFile('tsconfig.json')
    try {
      const tsconfig = JSON.parse(originalTsconfig)
      tsconfig.compilerOptions = {
        ...tsconfig.compilerOptions,
        skipLibCheck: false,
      }
      tsconfig.exclude = ['node_modules', '**/*.test.ts', '**/*.test.tsx']
      await next.patchFile('tsconfig.json', JSON.stringify(tsconfig, null, 2))

      const { exitCode, stdout, stderr } = await execa(
        'pnpm',
        ['tsc', '--noEmit'],
        {
          cwd: next.testDir,
          reject: false,
        }
      )

      // Step 5: Verify that TypeScript succeeds without duplicate/conflicting declaration errors
      expect({ exitCode, output: stdout + stderr }).toEqual({
        exitCode: 0,
        output: '',
      })
    } finally {
      await next.patchFile('tsconfig.json', originalTsconfig)
    }
  })

  it('should not fail build when .next/dev has stale types from deleted routes', async () => {
    // Step 1: Wait for dev server to generate .next/dev/types/validator.ts
    await retry(
      async () => {
        const exists = await next
          .readFile('.next/dev/types/validator.ts')
          .then(() => true)
          .catch(() => false)
        if (!exists) {
          throw new Error('validator.ts not generated yet')
        }
      },
      5000,
      500
    )

    // Verify validator.ts contains reference to temp-route
    const validatorContent = await next.readFile('.next/dev/types/validator.ts')
    expect(validatorContent).toContain('temp-route/page')

    // Step 2: Stop dev server
    await next.stop()

    // Step 3: Delete the temp-route (simulating user deleting a route)
    await next.deleteFile('app/temp-route/page.tsx')

    // Verify .next/dev/types/validator.ts still references deleted route (stale)
    const staleValidator = await next.readFile('.next/dev/types/validator.ts')
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
