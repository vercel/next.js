import { nextTestSetup } from 'e2e-utils'

describe('app dir - form - with basepath', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should add basePath to `action`', async () => {
    const session = await next.browser('/base/forms/basic')

    const start = Date.now()
    await session.eval(`window.__MPA_NAV_ID = ${start}`)

    const searchInput = await session.elementByCss('input[name="query"]')
    await searchInput.fill('my search')

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    const result = await session.waitForElementByCss('#search-results').text()
    expect(result).toMatch(/query: "my search"/)

    expect(await session.eval(`window.__MPA_NAV_ID`)).toEqual(start)
  })

  it("should not add basePath to a submitter's formAction", async () => {
    const session = await next.browser('/base/forms/button-formaction')

    const start = Date.now()
    await session.eval(`window.__MPA_NAV_ID = ${start}`)

    const searchInput = await session.elementByCss('input[name="query"]')
    await searchInput.fill('my search')

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    const result = await session.waitForElementByCss('#search-results').text()
    expect(result).toMatch(/query: "my search"/)

    expect(await session.eval(`window.__MPA_NAV_ID`)).toEqual(start)
  })
})
