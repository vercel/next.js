import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('delete-dot-next-dir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 500 error after .next is deleted', async () => {
    // 1. Verify both routes load correctly before deletion
    const appRes = await next.fetch('/')
    expect(appRes.status).toBe(200)
    expect(await appRes.text()).toContain('hello world')

    const pagesRes = await next.fetch('/another')
    expect(pagesRes.status).toBe(200)
    expect(await pagesRes.text()).toContain('another page')

    // 2. Record CLI output position before deletion
    const outputIndex = next.cliOutput.length

    // 3. Delete the .next directory while dev server is running
    await next.deleteFile('.next')

    // 4. Fetch both routes again — they should return 500
    const appResAfterDelete = await next.fetch('/')
    expect(appResAfterDelete.status).toBe(500)

    const pagesResAfterDelete = await next.fetch('/another')
    expect(pagesResAfterDelete.status).toBe(500)

    // 5. Capture the CLI error output
    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain('ENOENT')
    }, 10000)

    const cliOutput = next.cliOutput.slice(outputIndex)
    const normalizedOutput = next.normalizeTestDirContent(cliOutput)

    // Verify specific error messages appear in CLI output
    expect(normalizedOutput).toContain(
      "ENOENT: no such file or directory, open 'TEST_DIR/.next/"
    )
    expect(normalizedOutput).toContain('build-manifest.json')
  })
})
