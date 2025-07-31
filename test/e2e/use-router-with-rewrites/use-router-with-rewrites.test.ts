import { nextTestSetup } from 'e2e-utils'

describe('use-router-with-rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve current pathname when using useRouter.push with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementById('router-push').click()

    expect(await browser.url()).toBe(
      `http://localhost:${next.appPort}/?param=1`
    )
  })

  it('should preserve current pathname when using useRouter.replace with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementById('router-replace').click()

    expect(await browser.url()).toBe(
      `http://localhost:${next.appPort}/?param=1`
    )
  })
})
