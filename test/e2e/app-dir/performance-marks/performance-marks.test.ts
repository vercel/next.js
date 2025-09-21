import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { Playwright } from 'next-webdriver'

describe('performance-marks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getPerformanceMarks(
    browser: Playwright
  ): Promise<(PerformanceEntry & { entryType: 'mark' })[]> {
    return await browser.eval(`
      window.performance.getEntriesByType('mark').map(entry => ({
        name: entry.name,
        entryType: entry.entryType,
        startTime: entry.startTime,
        duration: entry.duration
      }))
    `)
  }

  async function getPerformanceMeasures(
    browser: Playwright
  ): Promise<(PerformanceEntry & { entryType: 'measure' })[]> {
    return await browser.eval(`
      window.performance.getEntriesByType('measure').map(entry => ({
        name: entry.name,
        entryType: entry.entryType,
        startTime: entry.startTime,
        duration: entry.duration
      }))
    `)
  }

  async function hasPerformanceMark(browser: Playwright, markName: string) {
    return await browser.eval(`
      window.performance.getEntriesByName('${markName}', 'mark').length > 0
    `)
  }

  async function hasPerformanceMeasure(
    browser: Playwright,
    measureName: string
  ) {
    return await browser.eval(`
      window.performance.getEntriesByName('${measureName}', 'measure').length > 0
    `)
  }

  describe('SSR with RSC', () => {
    it('should create performance marks and measures during hydration and RSC streaming', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        expect(await hasPerformanceMark(browser, 'beforeHydration')).toBe(true)
        expect(
          await hasPerformanceMeasure(browser, 'Next.js-before-hydration')
        ).toBe(true)

        expect(await hasPerformanceMark(browser, 'afterInitialCommit')).toBe(
          true
        )
        expect(
          await hasPerformanceMeasure(browser, 'Next.js-initial-commit')
        ).toBe(true)

        expect(await hasPerformanceMark(browser, 'rscStreamStart')).toBe(true)
        expect(await hasPerformanceMark(browser, 'rscStreamEnd')).toBe(true)
        expect(
          await hasPerformanceMeasure(browser, 'Next.js-rsc-stream-reader')
        ).toBe(true)
      })

      await browser.close()
    })
  })

  describe('CSR (Client-Side Rendering)', () => {
    it('should create performance marks and measures when rendering error pages', async () => {
      const browser = await next.browser('/client')

      await retry(async () => {
        expect(await hasPerformanceMark(browser, 'beforeRender')).toBe(true)
        expect(
          await hasPerformanceMeasure(browser, 'Next.js-before-render')
        ).toBe(true)
      })

      await browser.close()
    })
  })

  describe('Performance entries validation', () => {
    it('should have correct structure and chronological order for marks and measures', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        expect(
          await hasPerformanceMeasure(browser, 'Next.js-initial-commit')
        ).toBe(true)
      })

      const marks = await getPerformanceMarks(browser)
      const nextJsMarks = marks.filter((mark) =>
        [
          'beforeRender',
          'beforeHydration',
          'afterInitialCommit',
          'rscStreamStart',
          'rscStreamEnd',
        ].includes(mark.name)
      )

      expect(nextJsMarks.length).toBeGreaterThan(0)

      const measures = await getPerformanceMeasures(browser)
      const nextJsMeasures = measures.filter((measure) =>
        measure.name.startsWith('Next.js-')
      )

      expect(nextJsMeasures.length).toBeGreaterThan(0)

      // Assert chronological order: rscStreamStart → beforeHydration → afterInitialCommit
      const rscStreamStartMark = nextJsMarks.find(
        (mark) => mark.name === 'rscStreamStart'
      )
      const beforeHydrationMark = nextJsMarks.find(
        (mark) => mark.name === 'beforeHydration'
      )
      const afterInitialCommitMark = nextJsMarks.find(
        (mark) => mark.name === 'afterInitialCommit'
      )
      const rscStreamEndMark = nextJsMarks.find(
        (mark) => mark.name === 'rscStreamEnd'
      )

      if (
        rscStreamStartMark &&
        beforeHydrationMark &&
        afterInitialCommitMark &&
        rscStreamEndMark
      ) {
        expect(rscStreamStartMark.startTime).toBeLessThan(
          beforeHydrationMark.startTime
        )

        expect(beforeHydrationMark.startTime).toBeLessThan(
          afterInitialCommitMark.startTime
        )

        expect(rscStreamEndMark.startTime).toBeGreaterThan(
          rscStreamStartMark.startTime
        )
      }

      await browser.close()
    })
  })
})
