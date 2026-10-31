import { nextTestSetup } from 'e2e-utils'

describe('next start without next build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    startCommand: `pnpm next start`,
    serverReadyPattern: /Local:/,
  })

  it('should show error when there is no production build', async () => {
    await next.start()
    await new Promise<void>((resolve) => {
      next.on('stderr', (msg) => {
        if (msg.includes('Could not find a production build in the')) {
          resolve()
        }
      })
    })
  })
})
