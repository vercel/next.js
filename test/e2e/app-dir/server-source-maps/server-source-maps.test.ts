import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('app-dir - server source maps', () => {
  const { skipped, next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/default'),
    // Deploy tests don't have access to runtime logs.
    // Manually verify that the runtime logs match.
    skipDeployment: true,
  })

  if (skipped) return

  it('logged errors have a sourcemapped stack with a codeframe', async () => {
    // TODO: Write test once we run with `--enable-source-maps` when `experimental.serverSourceMaps` is set
  })

  it('logged errors have a sourcemapped `cause`', async () => {
    // TODO: Write test once we run with `--enable-source-maps` when `experimental.serverSourceMaps` is set
  })

  it('stack frames are ignore-listed in ssr', async () => {
    // TODO: hook up our error-inspect with `ignoreList` from sourcemaps
  })

  it('stack frames are ignore-listed in rsc', async () => {
    // TODO: hook up our error-inspect with `ignoreList` from sourcemaps
    // Note that browser (React replay) and server (Node.js) have different implementations for that
  })

  it('logged errors preserve their name', async () => {
    await next.render('/rsc-error-log-custom-name')

    expect(next.cliOutput).toContain(
      // TODO: isNextDev ? 'UnnamedError: Foo' : '[Error]: Foo'
      isNextDev ? 'Error: Foo' : 'Error: Foo'
    )
    expect(next.cliOutput).toContain(
      // TODO: isNextDev ? 'NamedError [MyError]: Bar' : '[MyError]: Bar'
      isNextDev ? 'Error [MyError]: Bar' : 'Error [MyError]: Bar'
    )
  })
})
