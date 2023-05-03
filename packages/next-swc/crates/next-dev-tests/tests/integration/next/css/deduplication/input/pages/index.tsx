import { useRef } from 'react'
import { Harness, useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useTestHarness((harness) => runTests(harness, iframeRef.current!))

  return (
    <>
      <iframe style={{ width: 800, height: 600 }} src="/a" ref={iframeRef} />
    </>
  )
}

declare global {
  interface Window {
    __TEST_CONTEXT_KEY?: number
  }
}

let once = false
function runTests(harness: Harness, iframe: HTMLIFrameElement) {
  if (once) return
  once = true
  const TIMEOUT = 40000

  it(
    'should have the correct style applied on initialization',
    async () => {
      await harness.waitForLoaded(iframe)
      await harness.waitForHydration(iframe, '/a')
      const link = await harness.waitForSelector(
        iframe.contentWindow!.document,
        'a'
      )
      expect(link).not.toBeNull()
      expect(getComputedStyle(link).color).toEqual('rgb(0, 0, 255)')
      const buttonA = await harness.waitForSelector(
        iframe.contentWindow!.document,
        'button.a'
      )
      expect(buttonA).not.toBeNull()
      expect(getComputedStyle(buttonA).color).toEqual('rgb(255, 0, 0)')
      const buttonB = await harness.waitForSelector(
        iframe.contentWindow!.document,
        'button.b'
      )
      expect(buttonB).not.toBeNull()
      expect(getComputedStyle(buttonB).color).toEqual('rgb(255, 0, 0)')
    },
    TIMEOUT
  )

  it('should have the correct style when loading dynamic styles', async () => {
    await harness.waitForLoaded(iframe)
    await harness.waitForHydration(iframe, '/a')
    const link = await harness.waitForSelector(
      iframe.contentWindow!.document,
      'a'
    )
    const buttonA = await harness.waitForSelector(
      iframe.contentWindow!.document,
      'button.a'
    )
    const buttonB = await harness.waitForSelector(
      iframe.contentWindow!.document,
      'button.b'
    )
    await iframe.contentWindow!.eval('DYNAMIC_IMPORT1()')
    expect(getComputedStyle(buttonA).color).toEqual('rgb(0, 0, 255)')
    expect(getComputedStyle(buttonB).color).toEqual('rgb(255, 0, 0)')
    expect(getComputedStyle(link).color).toEqual('rgb(0, 0, 255)')
    await iframe.contentWindow!.eval('DYNAMIC_IMPORT2()')
    expect(getComputedStyle(buttonA).color).toEqual('rgb(0, 0, 255)')
    expect(getComputedStyle(buttonB).color).toEqual('rgb(0, 0, 255)')
    expect(getComputedStyle(link).color).toEqual('rgb(0, 0, 255)')
  })

  it(
    'should have the correct style when navigating to B and back',
    async () => {
      await harness.waitForLoaded(iframe)
      await harness.waitForHydration(iframe, '/a')

      const key = Math.random()
      iframe.contentWindow!.__TEST_CONTEXT_KEY = key

      const link = await harness.waitForSelector(
        iframe.contentWindow!.document,
        'a.b'
      )
      expect(link).toBeInstanceOf(
        (iframe.contentWindow as any).HTMLAnchorElement
      )
      expect(link.textContent).toBe('B')
      ;(link as HTMLAnchorElement).click()

      await harness.waitForHydration(iframe, '/b')

      const link2 = await harness.waitForSelector(
        iframe.contentWindow!.document,
        'a.a'
      )
      expect(link2).toBeInstanceOf(
        (iframe.contentWindow as any).HTMLAnchorElement
      )
      expect(link2.textContent).toBe('A')
      ;(link2 as HTMLAnchorElement).click()

      await harness.waitForHydration(iframe, '/a')

      const link3 = await harness.waitForSelector(
        iframe.contentWindow!.document,
        'a.b'
      )
      expect(link3).toBeInstanceOf(
        (iframe.contentWindow as any).HTMLAnchorElement
      )
      expect(link3.textContent).toBe('B')
      expect(getComputedStyle(link3).color).toEqual('rgb(0, 0, 255)')

      expect(iframe.contentWindow!.__TEST_CONTEXT_KEY).toEqual(key)
    },
    TIMEOUT
  )
}
