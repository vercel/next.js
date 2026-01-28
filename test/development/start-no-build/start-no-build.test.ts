import { createNext } from 'e2e-utils'

describe('next start without next build', () => {
  it('should show error when there is no production build', async () => {
    const next = await createNext({
      files: __dirname,
      skipStart: true,
      startCommand: `pnpm next start`,
    })

    // next.start() will throw because the process exits before
    // the "Ready" pattern appears - this is expected
    try {
      await next.start()
    } catch {
      // Expected - process exits before server is ready
    }

    expect(next.cliOutput).toContain('Could not find a production build in the')

    await next.destroy()
  })
})
