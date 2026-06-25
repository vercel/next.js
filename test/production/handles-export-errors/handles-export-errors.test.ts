import { nextTestSetup } from 'e2e-utils'

describe('Handles Errors During Export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('Does not crash workers', async () => {
    const { cliOutput } = await next.build()

    expect(cliOutput).not.toMatch(/ERR_IPC_CHANNEL_CLOSED/)
    expect(cliOutput).toMatch(/Export encountered errors on \d+ paths?:/)
    expect(cliOutput).toContain('/page')
    expect(cliOutput).toContain('/page-1')
    expect(cliOutput).toContain('/page-2')
    expect(cliOutput).toContain('/page-3')
    expect(cliOutput).toContain('/page-13')
    expect(cliOutput).toContain('/blog/[slug]: /blog/first')
    expect(cliOutput).toContain('/blog/[slug]: /blog/second')
    expect(cliOutput).toContain('/custom-error')
    expect(cliOutput).toContain('custom error message')
  })
})
