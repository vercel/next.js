import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('action-tracing', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('should trace server action imported by client correctly', async () => {
    const traceData = (await next.readJSON(
      path.join('.next', 'server', 'app', 'page.js.nft.json')
    )) as {
      files: string[]
    }
    expect(traceData.files.some((file) => file.includes('data.txt'))).toBe(true)
  })
})
