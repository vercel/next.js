import { nextTestSetup } from 'e2e-utils'

describe('app dir - form', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should soft-navigate on submit and show the prefetched loading state', async () => {
    const session = await next.browser('/forms/basic')

    const start = Date.now()
    await session.eval(`window.__MPA_NAV_ID = ${start}`)

    const searchInput = await session.elementByCss('input[name="query"]')
    await searchInput.fill('my search')

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    // we should have prefetched a loading state, so it should be displayed
    await session.waitForElementByCss('#loading')

    const result = await session.waitForElementByCss('#search-results').text()
    expect(result).toMatch(/query: "my search"/)

    expect(await session.eval(`window.__MPA_NAV_ID`)).toEqual(start)
  })

  it.todo('should handle submitter with formAction')
  it.todo(
    'should handle submitter with unsupported form{EncType,Method,Target}'
  )
  it.todo('should handle file inputs')
  it.todo('should handle `replace`')
})
