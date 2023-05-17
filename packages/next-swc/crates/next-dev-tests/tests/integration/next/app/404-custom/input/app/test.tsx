'use client'

import { useRef } from 'react'
import { useTestHarness, Harness } from '@turbo/pack-test-harness'

export default function Test() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useTestHarness((harness) => runTests(harness, iframeRef.current!))

  return <iframe style={{ width: 800, height: 600 }} ref={iframeRef} />
}

function runTests(harness: Harness, iframe: HTMLIFrameElement) {
  // These tests requires a longer timeout because we're rendering the 404 page as well.
  const TIMEOUT = 20000

  it(
    'returns a 404 status code for the custom 404 page',
    async () => {
      const res = await fetch('/not-found')
      expect(res.status).toBe(404)
    },
    TIMEOUT
  )

  // TODO(NEXT-963) Fix this test once Next.js 404 page routing is fixed.
  it.skip(
    'navigates to the custom 404 page',
    async () => {
      await harness.load(iframe, '/link')
      await harness.waitForHydration(iframe, '/link')

      const link = iframe.contentDocument!.querySelector('a[data-test-link]')
      expect(link).not.toBeNull()
      expect(link!).toBeInstanceOf(
        (iframe.contentWindow as any).HTMLAnchorElement
      )
      ;(link as HTMLAnchorElement).click()

      await harness.waitForHydration(iframe, '/not-found')

      expect(
        iframe.contentDocument!.querySelector('[data-test-notfound]')
      ).not.toBeNull()
    },
    TIMEOUT
  )

  it(
    'renders a custom 404 page',
    async () => {
      await harness.load(iframe, '/not-found')
      await harness.waitForSelector(iframe, '[data-test-notfound]')

      expect(
        iframe.contentDocument!.querySelector('[data-test-notfound]')
      ).not.toBeNull()
    },
    TIMEOUT
  )

  it(
    'returns a 404 status code for a segment 404 page',
    async () => {
      const res = await fetch('/segment')
      expect(res.status).toBe(404)
    },
    TIMEOUT
  )

  // TODO(WEB-980) Fix this test once we no longer throw an error when rendering a 404 page.
  it.skip(
    'navigates to the segment 404 page',
    async () => {
      await harness.load(iframe, '/link-segment')
      await harness.waitForHydration(iframe, '/link-segment')

      const link = iframe.contentDocument!.querySelector('a[data-test-link]')
      expect(link).not.toBeNull()
      expect(link!).toBeInstanceOf(
        (iframe.contentWindow as any).HTMLAnchorElement
      )
      ;(link as HTMLAnchorElement).click()

      await harness.waitForHydration(iframe, '/segment')

      expect(
        iframe.contentDocument!.querySelector('[data-test-segmentnotfound]')
      ).not.toBeNull()
    },
    TIMEOUT
  )

  // TODO(WEB-980) Fix this test once we no longer throw an error when rendering a 404 page.
  it.skip(
    'renders a segment 404 page',
    async () => {
      await harness.load(iframe, '/segment')
      await harness.waitForSelector(iframe, '[data-test-segmentnotfound]')

      expect(
        iframe.contentDocument!.querySelector('[data-test-segmentnotfound]')
      ).not.toBeNull()
    },
    TIMEOUT
  )
}
