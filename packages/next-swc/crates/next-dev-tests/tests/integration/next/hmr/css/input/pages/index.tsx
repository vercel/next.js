import { useRef } from 'react'
import { Harness, useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useTestHarness((harness) => runTests(harness, iframeRef.current!))

  return (
    <iframe style={{ width: 800, height: 600 }} src="/page" ref={iframeRef} />
  )
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

      let element = iframe.contentDocument!.getElementById('element')!
      expect(element).not.toBeNull()
      expect(getComputedStyle(element).color).toBe('rgb(255, 0, 0)')
      console.log(getComputedStyle(element).color)

      await harness.changeFile('pages/page.module.css', 'red', 'blue')
      await harness.waitForCondition(
        () => getComputedStyle(element).color === 'rgb(0, 0, 255)'
      )

      console.log(getComputedStyle(element).color)

      // Make sure the page didn't reload.
      expect(iframe.contentWindow!.__NEXT_TEST_HMR).toBe(true)
    },
    TIMEOUT
  )
}
