import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('internal traces', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname)),
  })

  it('should not write long internal traces to stdio', async () => {
    await next.render$('/traces')
    expect(next.cliOutput.length).toBeLessThan(128 * 1024 /* 128kb of ascii */)
    expect(next.cliOutput).not.toContain(
      'https://nextjs.org/docs/messages/large-page-data'
    )
  })
})
