import { nextTestSetup } from 'e2e-utils'

function expectContainOnce(output: string, search: string) {
  const parts = output.split(search)
  // Ensure the search string is found once
  expect(parts.length).toBe(2)
}

describe('dedupe-rsc-error-log', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only log RSC error once for nodejs runtime', async () => {
    await next.fetch('/server')
    expectContainOnce(next.cliOutput, 'Custom error:server-node')
  })

  it('should only log RSC error once for edge runtime', async () => {
    await next.fetch('/server/edge')
    expectContainOnce(next.cliOutput, 'Custom error:server-edge')
  })

  it('should only log SSR error once for nodejs runtime', async () => {
    await next.fetch('/client')
    expectContainOnce(next.cliOutput, 'Custom error:client-node')
  })

  it('should only log SSR error once for edge runtime', async () => {
    await next.fetch('/client/edge')
    expectContainOnce(next.cliOutput, 'Custom error:client-edge')
  })
})
