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

  // https://github.com/vercel/next.js/issues/93844
  it('should not skip data fetching on back navigation to an entry that was shallowly replaced', async () => {
    // 1. initial page
    const browser = await next.browser('/first')
    const props1 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props1.params).toEqual({ slug: 'first' })

    // 2. shallow replace: no data fetch
    await browser.elementByCss('#replace-shallow').click()
    await retry(async () => {
      expect(await browser.url()).toContain('/first?count=1')
    })
    const props2 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props2).toEqual(props1)

    // 3. non-shallow push to another page: data fetch
    await browser.elementByCss('#to-another').click()
    await retry(async () => {
      const text = await browser.elementByCss('#props').text()
      expect(text).toMatch(/another/)
    })
    const props3 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props3.params).toEqual({ slug: 'another' })

    // 4. shallow replace on the second page: no data fetch
    await browser.elementByCss('#replace-shallow').click()
    await retry(async () => {
      expect(await browser.url()).toContain('/another?count=1')
    })
    const props4 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props4).toEqual(props3)

    // 5. back to the shallowly replaced entry must fetch fresh data
    await browser.back()
    await retry(async () => {
      expect(await browser.url()).toContain('/first?count=1')
      const props5 = JSON.parse(await browser.elementByCss('#props').text())
      expect(props5.params).toEqual({ slug: 'first' })
      expect(props5.random).not.toBe(props1.random)
      expect(props5.random).not.toBe(props3.random)
    })
  })
})
