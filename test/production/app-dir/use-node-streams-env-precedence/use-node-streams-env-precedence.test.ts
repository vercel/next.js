import { nextTestSetup } from 'e2e-utils'

describe('use-node-streams env precedence', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      __NEXT_USE_NODE_STREAMS: 'true',
    },
  })

  it('should respect explicit useNodeStreams=false even when env flag is true', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).toContain('useNodeStreams')
  })
})
