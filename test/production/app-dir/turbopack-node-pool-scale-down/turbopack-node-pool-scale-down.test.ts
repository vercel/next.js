import { nextTestSetup } from 'e2e-utils'

describe('turbopack-node-pool-scale-down', () => {
  const { next, isNextDeploy, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // With webpack a loader runs inside the build's own process.
  ;(isNextDeploy || !isTurbopack ? describe.skip : describe)(
    'webpack loader processes',
    () => {
      it('are stopped once the module graph is computed', async () => {
        // The page checks, while it is prerendered, whether the process that ran its loader is
        // still alive.
        const $ = await next.render$('/')
        expect($('main').text()).toBe('stopped')
      })
    }
  )
})
