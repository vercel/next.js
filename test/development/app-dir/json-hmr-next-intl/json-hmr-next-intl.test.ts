import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('json-hmr-next-intl', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'next-intl': '^4.8.3',
    },
  })

  // This regression only affects Turbopack dev mode (Server Fast Refresh)
  const itTurbopackDev = isTurbopack && isNextDev ? it : it.skip

  describe('server component with getTranslations', () => {
    itTurbopackDev(
      'reflects multiple consecutive JSON message edits via HMR',
      async () => {
        const browser = await next.browser('/')

        // Verify initial value
        await retry(async () => {
          const text = await browser.elementByCss('#intl-title').text()
          expect(text).toBe('Hello world')
        })

        const originalContent = await next.readFile('messages/en.json')

        try {
          // First edit — should update
          await next.patchFile(
            'messages/en.json',
            JSON.stringify({ HomePage: { title: 'First edit' } })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#intl-title').text()
            expect(text).toBe('First edit')
          })

          // Second edit — this is the regression: subsequent edits are ignored
          await next.patchFile(
            'messages/en.json',
            JSON.stringify({ HomePage: { title: 'Second edit' } })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#intl-title').text()
            expect(text).toBe('Second edit')
          })

          // Third edit — ensure continued HMR functionality
          await next.patchFile(
            'messages/en.json',
            JSON.stringify({ HomePage: { title: 'Third edit' } })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#intl-title').text()
            expect(text).toBe('Third edit')
          })
        } finally {
          await next.patchFile('messages/en.json', originalContent)
        }
      }
    )
  })

  describe('client component with useTranslations', () => {
    itTurbopackDev(
      'reflects multiple consecutive JSON message edits via HMR',
      async () => {
        const browser = await next.browser('/intl')

        // Verify initial value
        await retry(async () => {
          const text = await browser.elementByCss('#intl-client-title').text()
          expect(text).toBe('Hello world')
        })

        const originalContent = await next.readFile('messages/en.json')

        try {
          // First edit
          await next.patchFile(
            'messages/en.json',
            JSON.stringify({ HomePage: { title: 'Client first' } })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#intl-client-title').text()
            expect(text).toBe('Client first')
          })

          // Second edit — regression: subsequent edits ignored
          await next.patchFile(
            'messages/en.json',
            JSON.stringify({ HomePage: { title: 'Client second' } })
          )

          await retry(async () => {
            const text = await browser.elementByCss('#intl-client-title').text()
            expect(text).toBe('Client second')
          })
        } finally {
          await next.patchFile('messages/en.json', originalContent)
        }
      }
    )
  })
})
