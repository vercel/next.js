import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('json-hmr', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // This regression only affects Turbopack dev mode (Server Fast Refresh)
  const itTurbopackDev = isTurbopack && isNextDev ? it : it.skip

  describe('server component with static JSON import', () => {
    itTurbopackDev(
      'reflects multiple consecutive JSON edits via HMR',
      async () => {
        const browser = await next.browser('/')

        // Verify initial value
        await retry(async () => {
          const text = await browser.elementByCss('#server-value').text()
          expect(text).toBe('initial')
        })

        const originalContent = await next.readFile('data/config.json')

        try {
          // First edit — should update
          await next.patchFile(
            'data/config.json',
            JSON.stringify({ value: 'first-edit' })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#server-value').text()
            expect(text).toBe('first-edit')
          })

          // Second edit — this is the regression: subsequent edits are ignored
          await next.patchFile(
            'data/config.json',
            JSON.stringify({ value: 'second-edit' })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#server-value').text()
            expect(text).toBe('second-edit')
          })

          // Third edit — ensure continued HMR functionality
          await next.patchFile(
            'data/config.json',
            JSON.stringify({ value: 'third-edit' })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#server-value').text()
            expect(text).toBe('third-edit')
          })
        } finally {
          await next.patchFile('data/config.json', originalContent)
        }
      }
    )
  })

  describe('client component with static JSON import', () => {
    itTurbopackDev(
      'reflects multiple consecutive JSON edits via HMR',
      async () => {
        const browser = await next.browser('/client')

        // Verify initial value
        await retry(async () => {
          const text = await browser.elementByCss('#client-value').text()
          expect(text).toBe('initial')
        })

        const originalContent = await next.readFile('data/config.json')

        try {
          // First edit
          await next.patchFile(
            'data/config.json',
            JSON.stringify({ value: 'client-first' })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#client-value').text()
            expect(text).toBe('client-first')
          })

          // Second edit — regression: subsequent edits ignored
          await next.patchFile(
            'data/config.json',
            JSON.stringify({ value: 'client-second' })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#client-value').text()
            expect(text).toBe('client-second')
          })
        } finally {
          await next.patchFile('data/config.json', originalContent)
        }
      }
    )
  })

  describe('server component with dynamic import()', () => {
    itTurbopackDev(
      'reflects multiple consecutive JSON edits via HMR for dynamically imported JSON',
      async () => {
        const browser = await next.browser('/dynamic')

        // Verify initial value
        await retry(async () => {
          const text = await browser.elementByCss('#dynamic-value').text()
          expect(text).toBe('world')
        })

        const originalContent = await next.readFile('data/messages.json')

        try {
          // First edit
          await next.patchFile(
            'data/messages.json',
            JSON.stringify({ hello: 'dynamic-first' })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#dynamic-value').text()
            expect(text).toBe('dynamic-first')
          })

          // Second edit — regression: subsequent edits ignored
          await next.patchFile(
            'data/messages.json',
            JSON.stringify({ hello: 'dynamic-second' })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#dynamic-value').text()
            expect(text).toBe('dynamic-second')
          })
        } finally {
          await next.patchFile('data/messages.json', originalContent)
        }
      }
    )
  })
})
