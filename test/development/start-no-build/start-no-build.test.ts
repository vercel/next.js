import { createNext } from 'e2e-utils'

describe('next start without next build', () => {
  it('should show error when there is no production build', async () => {
    const next = await createNext({
      files: __dirname,
      skipStart: true,
      startCommand: `pnpm next start`,
      // Match "Ready in" or the error message since there's no build
      serverReadyPattern: /Ready in|Could not find a production build/,
    })

    await next.start()
    await new Promise<void>((resolve, reject) => {
      next.on('stderr', (msg) => {
        if (msg.includes('Could not find a production build in the')) {
          resolve()
        }
      })
    })

    await next.destroy()
  })
})
