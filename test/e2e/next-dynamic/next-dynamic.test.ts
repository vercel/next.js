import { nextTestSetup } from 'e2e-utils'

describe('next/dynamic', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should render server value', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/the-server-value/i)
  })

  it('should render dynamic server rendered values on client mount', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('#first-render').text()

    // Failure case is 'Index<!-- -->3<!-- --><!-- -->'
    expect(text).toMatch(
      /^Index<!--\/?(\$|\s)-->1(<!--\/?(\$|\s)-->)+2(<!--\/?(\$|\s)-->)+3(<!--\/?(\$|\s)-->)+4(<!--\/?(\$|\s)-->)+4$/
    )
    expect(await browser.eval('window.caughtErrors')).toBe('')

    // should not print "invalid-dynamic-suspense" warning in browser's console
    const logs = (await browser.log()).map((log) => log.message).join('\n')
    expect(logs).not.toContain(
      'https://nextjs.org/docs/messages/invalid-dynamic-suspense'
    )
  })
})
