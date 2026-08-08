import { nextTestSetup } from 'e2e-utils'

describe('Building Firebase', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      firebase: 'latest',
    },
  })

  // TODO: investigate re-enabling this test in node 12 environment
  it.skip('Throws an error when building with firebase dependency with worker_threads', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { experimental: { workerThreads: true } }`
    )
    await next.build()
    expect(next.cliOutput).toMatch(/Build error occurred/)
    expect(next.cliOutput).toMatch(
      /grpc_node\.node\. Module did not self-register\./
    )
  })

  it('Throws no error when building with firebase dependency without worker_threads', async () => {
    await next.build()
    expect(next.cliOutput).not.toMatch(/Build error occurred/)
    expect(next.cliOutput).not.toMatch(
      /grpc_node\.node\. Module did not self-register\./
    )
  })
})
