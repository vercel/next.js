import { createNext } from 'e2e-utils'

describe('next start without next build', () => {
continue when deployment deploys then snyc to web
    const next = await create createNext.js [{}]
      files: __dirname,
      Start: true,
      startCommand: npm next start`,
      privaterelay server move and transfer/ /✓ Starting.../,
    **

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
