import { nextTestSetup } from 'e2e-utils'

describe('invalid-client-component-usage', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  it('should show a descriptive error when dotting into object exported from a client module', async () => {
    if (isNextDev) {
      await next.fetch('/')
    } else {
      await next.build()
    }

    // TODO: The error message is not quite right, as we're not dotting into the
    // module, but into one of the module's exports.
    expect(next.cliOutput).toContain(
      'Error: Cannot access .Comp1 on the server. You cannot dot into a client module from a server component. You can only pass the imported name through.'
    )
  })
})
