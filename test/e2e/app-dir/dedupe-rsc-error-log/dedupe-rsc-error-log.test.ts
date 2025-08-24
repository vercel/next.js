import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

async function expectContainOnce(next: any, search: string) {
  // Ensure the search string is found once
  await retry(() => {
    const parts = next.cliOutput.split(search)
    expect(parts.length).toBe(2)
  })
}

describe('dedupe-rsc-error-log', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Runtime logs aren't available when deployed
    skipDeployment: true,
  })

  it('should only log RSC error once for nodejs runtime', async () => {
    await next.fetch('/server')
    await expectContainOnce(next, 'Custom error:server-node')
  })

  it('should only log RSC error once for edge runtime', async () => {
    await next.fetch('/server/edge')
    await expectContainOnce(next, 'Custom error:server-edge')
  })

  it('should only log SSR error once for nodejs runtime', async () => {
    await next.fetch('/client')
    await expectContainOnce(next, 'Custom error:client-node')
  })

  it('should only log SSR error once for edge runtime', async () => {
    await next.fetch('/client/edge')
    await expectContainOnce(next, 'Custom error:client-edge')
  })
})
