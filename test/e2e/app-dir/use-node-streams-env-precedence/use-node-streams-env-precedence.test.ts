import { nextTestSetup } from 'e2e-utils'

describe('use-node-streams env precedence', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
    env: {
      __NEXT_USE_NODE_STREAMS: 'true',
    },
  })

  if (isNextDev || skipped) {
    it.skip('only testable in start mode', () => {})
    return
  }

  it('should respect explicit useNodeStreams=false even when env flag is true', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).toContain('useNodeStreams')
  }, 30_000)
})
