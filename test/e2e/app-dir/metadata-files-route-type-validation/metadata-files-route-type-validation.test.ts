import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import { getDistDir, retry } from 'next-test-utils'

// Only the dev bundler's type generation emits the route-handler validation for
// metadata files (`next build`/`next typegen` omit them), so this suite is
// limited to dev mode.
// TODO(deploy-test-completion): This suite inspects locally generated types.
// @force-gate !deploy
// @force-gate dev
describe('metadata-files-route-type-validation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getValidator() {
    let validator = ''
    await retry(async () => {
      // Route types are generated asynchronously after the dev server starts.
      validator = await next.readFile(`${getDistDir()}/types/validator.ts`)
      expect(validator).toContain('const handler = {} as typeof import(')
    })
    return validator
  }

  it('validates the opengraph-image metadata file as a route handler', async () => {
    await next.fetch('/')

    const validator = await getValidator()

    // NOTE: this asserts current (incorrect) behavior. Metadata files are not
    // route handlers, so once they are excluded from route-handler validation
    // this expectation has to be updated to `not.toContain`.
    expect(validator).toContain('RouteHandlerConfig<"/opengraph-image">')
  })

  it('fails type checking on the documented metadata exports', async () => {
    await next.fetch('/')

    await getValidator()

    const { exitCode, stdout } = await execa('pnpm', ['tsc', '--noEmit'], {
      cwd: next.testDir,
      reject: false,
    })

    // NOTE: this asserts current (incorrect) behavior. `alt`, `size`,
    // `contentType` and the default image handler are documented metadata
    // exports, so a fix makes this type check pass and this expectation has to
    // be updated to `expect(exitCode).toBe(0)`.
    expect(exitCode).not.toBe(0)
    expect(stdout).toMatch(
      /error TS2559: Type 'typeof import\(.*app\/opengraph-image.*has no properties in common with type 'RouteHandlerConfig<"\/opengraph-image">'/
    )
  })
})
