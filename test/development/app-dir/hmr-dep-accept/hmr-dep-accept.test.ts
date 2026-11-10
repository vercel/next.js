import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('hmr-dep-accept', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('dependency accept', () => {
    it('parent accepts child dependency update without re-evaluating', async () => {
      const browser = await next.browser('/dep-accept')

      // Wait for initial render and hydration (eval time only appears after useEffect)
      await retry(async () => {
        const text = await browser.elementByCss('#dep-value').text()
        expect(text).toBe('initial')
      })
      await retry(async () => {
        const text = await browser.elementByCss('#parent-eval-time').text()
        expect(text).toMatch(/Parent Evaluated At: \d+/)
      })

      // Capture the parent evaluation timestamp
      const parentEvalTime = await browser
        .elementByCss('#parent-eval-time')
        .text()

      // Verify initial accept call count
      const initialCallCount = await browser
        .elementByCss('#accept-call-count')
        .text()
      expect(initialCallCount).toBe('Accept Calls: 0')

      // Patch the dependency to change its exported value
      await next.patchFile('app/dep-accept/dep.ts', (content) =>
        content.replace("'initial'", "'updated'")
      )

      // Wait for the accept callback to fire and update the UI
      await retry(async () => {
        const text = await browser.elementByCss('#dep-value').text()
        expect(text).toBe('updated')
      })

      // The accept callback should have been called
      await retry(async () => {
        const callCount = await browser
          .elementByCss('#accept-call-count')
          .text()
        expect(callCount).toBe('Accept Calls: 1')
      })

      // The parent module should NOT have been re-evaluated
      const newParentEvalTime = await browser
        .elementByCss('#parent-eval-time')
        .text()
      expect(newParentEvalTime).toBe(parentEvalTime)
    })
  })

  describe('dependency accept with array', () => {
    it('parent accepts multiple child dependencies via array', async () => {
      const browser = await next.browser('/dep-accept-array')

      // Wait for initial render
      await retry(async () => {
        const text = await browser.elementByCss('#dep-a-value').text()
        expect(text).toBe('initial-a')
      })
      await retry(async () => {
        const text = await browser.elementByCss('#dep-b-value').text()
        expect(text).toBe('initial-b')
      })
      await retry(async () => {
        const text = await browser.elementByCss('#parent-eval-time').text()
        expect(text).toMatch(/Parent Evaluated At: \d+/)
      })

      const parentEvalTime = await browser
        .elementByCss('#parent-eval-time')
        .text()

      // Patch dep-a
      await next.patchFile('app/dep-accept-array/dep-a.ts', (content) =>
        content.replace("'initial-a'", "'updated-a'")
      )

      await retry(async () => {
        const text = await browser.elementByCss('#dep-a-value').text()
        expect(text).toBe('updated-a')
      })

      await retry(async () => {
        const callCount = await browser
          .elementByCss('#accept-call-count')
          .text()
        expect(callCount).toBe('Accept Calls: 1')
      })

      // Parent should NOT have been re-evaluated
      const evalTimeAfterA = await browser
        .elementByCss('#parent-eval-time')
        .text()
      expect(evalTimeAfterA).toBe(parentEvalTime)

      // Patch dep-b
      await next.patchFile('app/dep-accept-array/dep-b.ts', (content) =>
        content.replace("'initial-b'", "'updated-b'")
      )

      await retry(async () => {
        const text = await browser.elementByCss('#dep-b-value').text()
        expect(text).toBe('updated-b')
      })

      await retry(async () => {
        const callCount = await browser
          .elementByCss('#accept-call-count')
          .text()
        expect(callCount).toBe('Accept Calls: 2')
      })

      // Parent should still NOT have been re-evaluated
      const evalTimeAfterB = await browser
        .elementByCss('#parent-eval-time')
        .text()
      expect(evalTimeAfterB).toBe(parentEvalTime)
    })
  })

  describe('dependency accept via module.hot (CJS)', () => {
    it('CJS module registers module.hot.accept and receives dep updates', async () => {
      const browser = await next.browser('/dep-accept-cjs')

      // Wait for initial render
      await retry(async () => {
        const text = await browser.elementByCss('#dep-value').text()
        expect(text).toBe('initial')
      })
      await retry(async () => {
        const text = await browser.elementByCss('#parent-eval-time').text()
        expect(text).toMatch(/Parent Evaluated At: \d+/)
      })

      const parentEvalTime = await browser
        .elementByCss('#parent-eval-time')
        .text()

      expect(await browser.elementByCss('#accept-call-count').text()).toBe(
        'Accept Calls: 0'
      )

      // Patch the dependency
      await next.patchFile('app/dep-accept-cjs/dep.cjs', (content) =>
        content.replace("'initial'", "'updated'")
      )

      // dep-observer.cjs handles the update via module.hot.accept
      await retry(async () => {
        const text = await browser.elementByCss('#dep-value').text()
        expect(text).toBe('updated')
      })

      await retry(async () => {
        const callCount = await browser
          .elementByCss('#accept-call-count')
          .text()
        expect(callCount).toBe('Accept Calls: 1')
      })

      // page.tsx should NOT have been re-evaluated (no full reload)
      const newParentEvalTime = await browser
        .elementByCss('#parent-eval-time')
        .text()
      expect(newParentEvalTime).toBe(parentEvalTime)
    })
  })

  describe('dependency decline', () => {
    it('declining a dependency triggers full reload on update', async () => {
      const browser = await next.browser('/dep-decline')

      // Wait for initial render
      await retry(async () => {
        const text = await browser.elementByCss('#dep-value').text()
        expect(text).toBe('initial')
      })
      await retry(async () => {
        const text = await browser.elementByCss('#parent-eval-time').text()
        expect(text).toMatch(/Parent Evaluated At: \d+/)
      })

      const parentEvalTime = await browser
        .elementByCss('#parent-eval-time')
        .text()

      await browser.eval('window.beforeDecline = true')

      // Patch the declined dependency
      await next.patchFile('app/dep-decline/dep.ts', (content) =>
        content.replace("'initial'", "'updated'")
      )

      // Since the dep is declined, the update should cause a full page reload.
      // After reload, the page re-evaluates with the new dep value.
      await retry(async () => {
        const text = await browser.elementByCss('#dep-value').text()
        expect(text).toBe('updated')
      })

      // A full reload clears window state, unlike Fast Refresh.
      expect(await browser.eval('window.beforeDecline')).toBeUndefined()

      // The parent module SHOULD have been re-evaluated (full reload)
      await retry(async () => {
        const newParentEvalTime = await browser
          .elementByCss('#parent-eval-time')
          .text()
        expect(newParentEvalTime).not.toBe(parentEvalTime)
      })
    })
  })

  describe('dependency decline with array', () => {
    it('declining multiple dependencies via array triggers full reload', async () => {
      const browser = await next.browser('/dep-decline-array')

      // Wait for initial render
      await retry(async () => {
        const text = await browser.elementByCss('#dep-a-value').text()
        expect(text).toBe('initial-a')
      })
      await retry(async () => {
        const text = await browser.elementByCss('#dep-b-value').text()
        expect(text).toBe('initial-b')
      })
      await retry(async () => {
        const text = await browser.elementByCss('#parent-eval-time').text()
        expect(text).toMatch(/Parent Evaluated At: \d+/)
      })

      const parentEvalTime = await browser
        .elementByCss('#parent-eval-time')
        .text()

      await browser.eval('window.beforeDecline = true')

      // Patch dep-a (declined) — should trigger full reload
      await next.patchFile('app/dep-decline-array/dep-a.ts', (content) =>
        content.replace("'initial-a'", "'updated-a'")
      )

      await retry(async () => {
        const text = await browser.elementByCss('#dep-a-value').text()
        expect(text).toBe('updated-a')
      })

      // A full reload clears window state, unlike Fast Refresh.
      expect(await browser.eval('window.beforeDecline')).toBeUndefined()

      // The parent module SHOULD have been re-evaluated (full reload)
      await retry(async () => {
        const newParentEvalTime = await browser
          .elementByCss('#parent-eval-time')
          .text()
        expect(newParentEvalTime).not.toBe(parentEvalTime)
      })
    })
  })
})
