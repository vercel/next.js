/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'

const countHreflangLinks = (linkHeader: string | null) =>
  linkHeader?.match(/hreflang=/g)?.length ?? 0

describe('proxy Link header with Cache Components revalidation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function fetchPage() {
    const response = await next.fetch('/ru')
    expect(response.status).toBe(200)

    const linkHeader = response.headers.get('link')
    expect(linkHeader).toContain('hreflang="ru"')
    expect(linkHeader).toContain('rel=preload')
    expect(countHreflangLinks(linkHeader)).toBe(4)
    expect(linkHeader?.match(/as="font"/g)).toHaveLength(1)

    const $ = load(await response.text())
    const renderedAt = $('#rendered-at').text()
    expect(renderedAt).not.toBe('')
    return renderedAt
  }

  // @force-gate !dev
  it('does not duplicate proxy Link headers after revalidation when next/font/local also emits preload links', async () => {
    let renderedAt = await fetchPage()

    for (let cycle = 0; cycle < 3; cycle++) {
      const previous = renderedAt
      renderedAt = await retry(async () => {
        const current = await fetchPage()
        expect(current).not.toBe(previous)
        return current
      }, 30_000)
    }
  })
})
