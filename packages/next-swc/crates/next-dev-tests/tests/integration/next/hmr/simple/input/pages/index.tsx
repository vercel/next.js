import { useRef } from 'react'
import { Harness, useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useTestHarness((harness) => runTests(harness, iframeRef.current!))

  return (
    <iframe style={{ width: 800, height: 600 }} src="/page" ref={iframeRef} />
  )
}

async function waitForMutations(node: Node) {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver((mutations) => {
      resolve(mutations)
      observer.disconnect()
    })
    observer.observe(node, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    })
  })
}

function runTests(harness: Harness, iframe: HTMLIFrameElement) {
  // These tests requires a longer timeout because we're rendering another page as well.
  const TIMEOUT = 20000

  it(
    'updates the page without reloading',
    async () => {
      await harness.waitForLoaded(iframe)
      await harness.waitForHydration(iframe, '/page')

      iframe.contentWindow!.__NEXT_TEST_HMR = true

      let replacement = iframe.contentDocument!.getElementById('replacement')!
      expect(replacement).not.toBeNull()
      expect(replacement.textContent).toBe('World')

      await Promise.all([
        harness.changeFile('pages/page.tsx', 'World', 'Next.js'),
        waitForMutations(replacement),
      ])

      expect(replacement.textContent).toBe('Next.js')
      // Make sure the page didn't reload.
      expect(iframe.contentWindow!.__NEXT_TEST_HMR).toBe(true)
    },
    TIMEOUT
  )
}
