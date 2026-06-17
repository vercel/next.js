import { nextTestSetup } from 'e2e-utils'

describe('load-config-freq', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only load next config once when start next dev server', async () => {
    await next.fetch('/')
    const output = next.cliOutput

    // Ensure there's only one "[ASSERTION] load nextConfig" in the text
    const parts = output.split(/\[ASSERTION\] load nextConfig/g)
    expect(parts).toHaveLength(2)
  })
})
