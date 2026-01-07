import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'node:path'

describe('internal traces', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname)),
  })

  it('should not write long internal traces to stdio', async () => {
    await next.render$('/traces')
    expect(next.cliOutput.length).toBeLessThan(256 * 1024 /* 256KiB of ascii */)
    expect(next.cliOutput).not.toContain(
      'https://nextjs.org/docs/messages/large-page-data'
    )
  })
})
