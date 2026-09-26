import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Client Shallow Routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not shallowly navigate back in history when current page was not shallow', async () => {
    const browser = await next.browser('/first')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.params).toEqual({ slug: 'first' })

    await browser.elementByCss('#add-query-shallow').click()
    await retry(async () => {
      const props2 = JSON.parse(await browser.elementByCss('#props').text())
      expect(props2).toEqual(props)
    })

    await browser.elementByCss('#remove-query-shallow').click()
    await retry(async () => {
      const props3 = JSON.parse(await browser.elementByCss('#props').text())
      expect(props3).toEqual(props)
    })

    await browser.elementByCss('#to-another').click()
    await retry(async () => {
      const text = await browser.elementByCss('#props').text()
      expect(text).toMatch(/another/)
    })

    const props4 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props4.params).toEqual({ slug: 'another' })
    expect(props4.random).not.toBe(props.random)

    await browser.back()
    await retry(async () => {
      const props5 = JSON.parse(await browser.elementByCss('#props').text())
      expect(props5.params).toEqual({ slug: 'first' })
      expect(props5.random).not.toBe(props4.random)
    })
  })

  it('should not shallowly navigate forwards in history when current page was not shallow', async () => {
    const browser = await next.browser('/first')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.params).toEqual({ slug: 'first' })

    await browser.elementByCss('#add-query-shallow').click()
    await retry(async () => {
      const props2 = JSON.parse(await browser.elementByCss('#props').text())
      expect(props2).toEqual(props)
    })

    await browser.elementByCss('#to-another').click()
    await retry(async () => {
      const props3text = await browser.elementByCss('#props').text()
      expect(props3text).toMatch(/another/)
    })

    const props3 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props3.params).toEqual({ slug: 'another' })
    expect(props3.random).not.toBe(props.random)

    await browser.back()
    await retry(async () => {
      const props4text = await browser.elementByCss('#props').text()
      expect(props4text).toMatch(/first/)
    })

    const props4 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props4.params).toEqual({ slug: 'first' })
    expect(props4.random).not.toBe(props3.random)

    await browser.forward()
    await retry(async () => {
      const props5text = await browser.elementByCss('#props').text()
      expect(props5text).toMatch(/another/)
    })

    const props5 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props5.params).toEqual({ slug: 'another' })
    expect(props5.random).not.toBe(props4.random)
  })

  it('should not skip getServerSideProps when navigating back to a router.replace shallow entry', async () => {
    // Regression test for https://github.com/vercel/next.js/issues/93844
    // When router.replace is called with shallow:true, the shallow flag must not
    // be re-applied on browser back/forward navigation (popstate).
    const browser = await next.browser('/first')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.params).toEqual({ slug: 'first' })
    const initialRandom = props.random

    // Shallow-replace the URL (no getServerSideProps call)
    await browser.elementByCss('#replace-shallow').click()
    await retry(async () => {
      const props2 = JSON.parse(await browser.elementByCss('#props').text())
      // random must remain the same — no data fetch happened
      expect(props2.random).toBe(initialRandom)
    })

    // Navigate to another page (non-shallow, triggers getServerSideProps)
    await browser.elementByCss('#to-another').click()
    await retry(async () => {
      const text = await browser.elementByCss('#props').text()
      expect(text).toMatch(/another/)
    })

    const propsAnother = JSON.parse(await browser.elementByCss('#props').text())

    // Press browser back — should land on the replaced URL and fire getServerSideProps
    await browser.back()
    await retry(async () => {
      const props3 = JSON.parse(await browser.elementByCss('#props').text())
      // random must change — getServerSideProps must have been called
      expect(props3.random).not.toBe(propsAnother.random)
      expect(props3.random).not.toBe(initialRandom)
    })
  })
})
