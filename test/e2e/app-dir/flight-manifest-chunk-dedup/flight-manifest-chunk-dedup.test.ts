import { nextTestSetup } from 'e2e-utils'

describe('flight-manifest-chunk-dedup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should eliminate duplicate chunk URLs in Flight Payload while hydrating successfully', async () => {
    // 1. Fetch the raw HTML and extract the serialized Flight Payload
    const res = await next.fetch('/')
    const html = await res.text()

    // Find all `:I[...]` client reference metadata rows in the payload
    const importRowRegex = /[0-9a-f]+:I(\[.*?\])\n/g
    const matches: any[] = []
    let match: RegExpExecArray | null

    const unescapedHtml = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    while ((match = importRowRegex.exec(unescapedHtml)) !== null) {
      try {
        const metadata = JSON.parse(match[1])
        matches.push(metadata)
      } catch {}
    }

    // Also check via RSC request directly
    const rscRes = await next.fetch('/', {
      headers: { RSC: '1' },
    })
    const rscText = await rscRes.text()
    const rscMatches: any[] = []
    while ((match = importRowRegex.exec(rscText)) !== null) {
      try {
        const metadata = JSON.parse(match[1])
        rscMatches.push(metadata)
      } catch {}
    }

    const clientRows = matches.length > 0 ? matches : rscMatches
    expect(clientRows.length).toBeGreaterThanOrEqual(4)

    // Verify chunk deduplication:
    // The first client reference should contain chunks
    const firstChunks = clientRows[0][1]
    expect(Array.isArray(firstChunks)).toBe(true)

    // Check that at least one subsequent client reference has empty chunks `[]` (deduplicated)
    const subsequentRows = clientRows.slice(1)
    const hasEmptyChunksRow = subsequentRows.some(
      (row) => Array.isArray(row[1]) && row[1].length === 0
    )
    expect(hasEmptyChunksRow).toBe(true)

    // 2. Verify in browser that hydration and client interactivity work perfectly
    const browser = await next.browser('/')

    expect(await browser.elementByCss('h1').text()).toBe('Flight Chunk Dedup Test')
    expect(await browser.elementByCss('#client-header').text()).toBe('Header Initial')
    expect(await browser.elementByCss('#client-footer').text()).toBe('Footer Initial')
    expect(await browser.elementByCss('#client-sidebar').text()).toBe('Sidebar: Closed')
    expect(await browser.elementByCss('#counter-value').text()).toBe('0')

    // Click interactions
    await browser.elementByCss('#client-header').click()
    expect(await browser.elementByCss('#client-header').text()).toBe('Header Clicked')

    await browser.elementByCss('#client-footer').click()
    expect(await browser.elementByCss('#client-footer').text()).toBe('Footer Clicked')

    await browser.elementByCss('#client-sidebar').click()
    expect(await browser.elementByCss('#client-sidebar').text()).toBe('Sidebar: Open')

    await browser.elementByCss('#counter-btn').click()
    expect(await browser.elementByCss('#counter-value').text()).toBe('1')

    await browser.elementByCss('#counter-btn').click()
    expect(await browser.elementByCss('#counter-value').text()).toBe('2')
  })
})
