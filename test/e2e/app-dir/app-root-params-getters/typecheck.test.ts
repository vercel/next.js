import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import { join } from 'path'
import { retry } from 'next-test-utils'

// Each fixture has a typecheck-validation.ts that imports from 'next/root-params'
// and uses @ts-expect-error to assert correct and incorrect type assignments.
// Running `tsc --noEmit` verifies the generated root-params.d.ts is wired in
// and produces the expected types.

describe.each([{ fixture: 'simple' }, { fixture: 'multiple-roots' }])(
  'app-root-param-getters - typecheck ($fixture)',
  ({ fixture }) => {
    const { next, skipped } = nextTestSetup({
      files: join(__dirname, 'fixtures', fixture),
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('should pass typecheck with generated root-params types', async () => {
      await retry(async () => {
        await next.readFile(`${next.distDir}/types/root-params.d.ts`)
      })

      await next.stop()
      try {
        const { stdout, stderr } = await execa('pnpm', ['tsc', '--noEmit'], {
          cwd: next.testDir,
          reject: false,
        })

        expect({ stdout, stderr }).toEqual({
          stdout: '',
          stderr: '',
        })
      } finally {
        await next.start()
      }
    })
  }
)
