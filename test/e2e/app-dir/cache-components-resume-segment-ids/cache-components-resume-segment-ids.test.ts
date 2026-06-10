import { nextTestSetup } from 'e2e-utils'

const SEGMENT_RE = /<div hidden id="([^"]*S:[0-9a-f]+)">/g
const COMPLETION_RE = /\$RC\("([^"]+)","([^"]+)"\)/g

function collectSegmentIds(html: string): string[] {
  return Array.from(html.matchAll(SEGMENT_RE), (m) => m[1])
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id)
    }
    seen.add(id)
  }

  return [...duplicates]
}

// The page is a Partial Prerender: the stored HTML contains hidden segments
// for the outlined cached widgets (written by the build-time resume pass),
// while the stored postponed state still carries the segment id counter from
// before that pass. The runtime resume that renders the dynamic footer
// allocates new segment ids from that stale counter, producing duplicate
// `S:x` ids in a single document. React's inline $RC("B:x", "S:x")
// completion script resolves elements via getElementById, so a duplicated
// segment id swaps the wrong fragment into the wrong Suspense hole and
// visibly corrupts the page.
describe('cache-components-resume-segment-ids', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (!isNextStart) {
    it('only runs against next build && next start', () => {})
    return
  }

  async function fetchHomeHtml(): Promise<string> {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    return res.text()
  }

  it('does not emit duplicate hidden segment ids when resuming', async () => {
    const html = await fetchHomeHtml()
    const segments = collectSegmentIds(html)

    expect(findDuplicates(segments)).toEqual([])
  })

  it('references an unambiguous segment from every completion script', async () => {
    const html = await fetchHomeHtml()
    const segments = collectSegmentIds(html)

    const completions = Array.from(
      html.matchAll(COMPLETION_RE),
      (m) => m[2]
    ).filter((id) => id.includes('S:'))

    expect(completions.length).toBeGreaterThan(0)

    for (const segmentId of completions) {
      const occurrences = segments.filter((id) => id === segmentId).length
      expect(`${segmentId}:${occurrences}`).toBe(`${segmentId}:1`)
    }
  })

  it('renders widget and footer content into their own boundaries', async () => {
    const html = await fetchHomeHtml()

    for (let index = 0; index < 3; index++) {
      expect(html).toContain(`long-widget-${index}-data`)
    }
    expect(html).toContain('footer-row-0')

    // The footer boundary must not receive widget content (the visible
    // corruption mode of the id collision).
    const footerStart = html.indexOf('<footer id="dynamic-footer">')
    if (footerStart !== -1) {
      const footerEnd = html.indexOf('</footer>', footerStart)
      const footerHtml = html.slice(footerStart, footerEnd)
      expect(footerHtml).not.toContain('long-widget')
    }
  })
})
