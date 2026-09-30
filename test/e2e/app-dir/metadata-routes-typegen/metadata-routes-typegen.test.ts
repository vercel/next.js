import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import { getDistDir, retry } from 'next-test-utils'

// The generated validator file only contains metadata routes in dev mode,
// where the route handler validations are emitted by the dev typegen.
// @force-gate dev
describe('metadata-routes-typegen', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getValidatorFile() {
    let validator = ''
    await retry(async () => {
      validator = await next.readFile(`${getDistDir()}/types/validator.ts`)
      // sanity check that typegen ran and validated the real route handler
      expect(validator).toContain('RouteHandlerConfig<"/api/hello">')
    })
    return validator
  }

  it.failing(
    'should not validate metadata files as route handlers',
    async () => {
      await next.fetch('/')
      const validator = await getValidatorFile()

      expect(validator).not.toContain('RouteHandlerConfig<"/icon">')
      expect(validator).not.toContain('RouteHandlerConfig<"/opengraph-image">')
      expect(validator).not.toContain('RouteHandlerConfig<"/sitemap.xml">')
    }
  )

  it.failing(
    'should type check an app with metadata files after typegen',
    async () => {
      await next.fetch('/')
      await getValidatorFile()

      const { stdout, stderr } = await execa('pnpm', ['tsc', '--noEmit'], {
        cwd: next.testDir,
        reject: false,
      })

      expect({ stdout, stderr }).toEqual({ stdout: '', stderr: '' })
    }
  )
})
