import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-slot-flight', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Helper to extract flight data from script tags
  function extractFlightData(html: string): string {
    const matches = html.match(
      /self\.__next_f\.push\(\[[\d,]+"([^"]*(?:\\.[^"]*)*)"\]\)/g
    )
    return matches ? matches.join('\n') : ''
  }

  // Scenario B: nested route in slot - (slot) should be present in BOTH bundlers
  it('should include (slot) in flight state for nested routes in parallel slot', async () => {
    const html = await next.render('/with-nested/nested')
    const flightData = extractFlightData(html)
    expect(flightData).toContain('(slot)')
  })

  // Scenario A: direct page in slot - behavior differs between bundlers
  it('should include (slot) in flight state for direct page in parallel slot', async () => {
    const html = await next.render('/')
    const flightData = extractFlightData(html)
    if (process.env.TURBOPACK) {
      // Turbopack always wraps parallel slot content in a (slot) level
      expect(flightData).toContain('(slot)')
    } else {
      // Webpack does NOT emit (slot) for direct pages in parallel slots
      // This documents the current discrepancy
      expect(flightData).not.toContain('(slot)')
    }
  })
})
