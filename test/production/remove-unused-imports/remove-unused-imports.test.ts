import { nextTestSetup } from 'e2e-utils'

describe('remove-unused-imports', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should remove unused imports', async () => {
    const browser = await next.browser('/')
    let scripts = await browser.elementsByCss('script[src]')

    expect(
      (
        await Promise.all(
          scripts.map(async (el) => {
            const src = await el.getAttribute('src')
            const res = await next.fetch(src)
            const code = await res.text()
            if (code.includes('This is a big library.')) {
              return src
            }
            return false
          })
        )
      ).filter((item) => item)
    ).toBeEmpty()
  })
})
