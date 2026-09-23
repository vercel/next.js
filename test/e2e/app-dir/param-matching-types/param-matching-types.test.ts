import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import { retry } from 'next-test-utils'

// Type checking requires local generated files, not a deployed HTTP response.
// @force-gate !deploy
describe('param-matching-types', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  beforeAll(async () => {
    await next.fetch('/')
    await retry(async () => {
      expect(
        await next.readFile(`${next.distDir}/types/validator.ts`)
      ).toContain('experimental_generateParamMatching')
    })
  })

  it('accepts ordinary object literals and generator returns without as const', async () => {
    const result = await execa('pnpm', ['tsc', '--noEmit'], {
      cwd: next.testDir,
      reject: false,
    })
    expect(result.stdout + result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
  })

  it.each([
    ['app/static/[lang]/layout.tsx', 'fixtures/invalid-layout.tsx'],
    ['app/generated/[slug]/page.tsx', 'fixtures/invalid-generator.tsx'],
  ])('still rejects invisible parameter keys in %s', async (file, fixture) => {
    const original = await next.readFile(file)
    try {
      await next.patchFile(file, await next.readFile(fixture))
      const result = await execa('pnpm', ['tsc', '--noEmit'], {
        cwd: next.testDir,
        reject: false,
      })
      expect(result.exitCode).not.toBe(0)
      expect(result.stdout).toContain('"missing"')
      expect(result.stdout).toContain("constraint 'never'")
    } finally {
      await next.patchFile(file, original)
    }
  })
})
