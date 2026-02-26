import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('loader-compilation-counter', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show token values from both files', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#tokenA').text()).toBe('4')
      expect(await browser.elementByCss('#tokenB').text()).toBe('4')
    })
  })

  it('should update both files when token.json changes', async () => {
    const browser = await next.browser('/')

    // Edit token.json to trigger HMR for both a.ts and b.ts
    await next.patchFile('lib/token.json', JSON.stringify({ value: 5 }))

    await retry(async () => {
      expect(await browser.elementByCss('#tokenA').text()).toBe('5')
      expect(await browser.elementByCss('#tokenB').text()).toBe('5')
    })
  })

  it('simple counter should differ between a and b (increments per call)', async () => {
    const browser = await next.browser('/')

    // Edit token.json so both files are reprocessed in same batch
    await next.patchFile('lib/token.json', JSON.stringify({ value: 6 }))

    await retry(async () => {
      expect(await browser.elementByCss('#tokenA').text()).toBe('6')
      expect(await browser.elementByCss('#tokenB').text()).toBe('6')

      const counterA = parseInt(await browser.elementByCss('#counterA').text())
      const counterB = parseInt(await browser.elementByCss('#counterB').text())

      // Simple counter increments per loader call, so a and b get different values
      expect(counterA).not.toBe(counterB)
    })
  })

  it('compilation counter should be the same for a and b (increments per compilation)', async () => {
    const browser = await next.browser('/')

    await next.patchFile('lib/token.json', JSON.stringify({ value: 7 }))

    await retry(async () => {
      expect(await browser.elementByCss('#tokenA').text()).toBe('7')
      expect(await browser.elementByCss('#tokenB').text()).toBe('7')

      const compCounterA = parseInt(
        await browser.elementByCss('#compCounterA').text()
      )
      const compCounterB = parseInt(
        await browser.elementByCss('#compCounterB').text()
      )

      // Compilation counter increments per compilation, so a and b get SAME value
      expect(compCounterA).toBe(compCounterB)
      expect(compCounterA).toBeGreaterThan(0)
    })
  })
})
