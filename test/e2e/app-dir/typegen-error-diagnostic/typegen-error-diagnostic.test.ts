import { nextTestSetup } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

describe('typegen error diagnostic', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    // We drive `next typegen` manually; no server needed.
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('fails loudly with an actionable message when route types cannot be generated', async () => {
    // `next typegen` runs with NODE_ENV=production, which makes the fixture's
    // next.config.js throw on the missing SOME_REQUIRED_TOKEN (the same shape as
    // a real app's env assertion). typegen therefore cannot generate route types.
    const { code, stdout, stderr } = await runNextCommand(
      ['typegen', next.testDir],
      { stderr: true, stdout: true }
    )
    const output = stdout + stderr

    // Regression: `next typegen` used to swallow the failure (exit code 0) and
    // write no route types, leaving the user with cryptic
    // `Cannot find name 'PageProps'/'LayoutProps'` errors from a later `tsc` run.
    // It must instead fail so `next typegen && tsc` chains halt.
    expect(code).not.toBe(0)

    // The message must connect the failure to route-type generation, so the user
    // understands why PageProps/LayoutProps go missing.
    expect(output).toMatch(/route types/i)

    // ...and still surface the underlying cause.
    expect(output).toContain('SOME_REQUIRED_TOKEN is missing from env')
  })
})
