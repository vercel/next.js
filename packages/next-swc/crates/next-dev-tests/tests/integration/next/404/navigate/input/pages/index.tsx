import { useEffect, useRef } from 'react'

export default function Page() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then((mod) =>
      runTests(mod, iframeRef.current!)
    )
  })

  return (
    <iframe style={{ width: 800, height: 600 }} src="/link" ref={iframeRef} />
  )
}

type Harness = typeof import('@turbo/pack-test-harness')

function runTests(harness: Harness, iframe: HTMLIFrameElement) {
  // These tests requires a longer timeout because we're rendering the 404 page as well.
  const TIMEOUT = 20000

  it(
    'returns a 404 status code',
    async () => {
      const res = await fetch('/not-found')
      expect(res.status).toBe(404)
    },
    TIMEOUT
  )

  it(
    'navigates to the 404 page',
    async () => {
      await harness.waitForHydration(iframe, '/link')

      const link = iframe.contentDocument!.querySelector('a[data-test-link]')
      expect(link).not.toBeNull()
      expect(link!).toBeInstanceOf(
        (iframe.contentWindow as any).HTMLAnchorElement
      )
      expect(link!.textContent).toBe('Not found')
      ;(link as HTMLAnchorElement).click()

      await harness.waitForHydration(iframe, '/not-found')

      const error = iframe.contentDocument!.querySelector('[data-test-error]')
      expect(error).not.toBeNull()
      expect(error!.textContent).toBe('static')
    },
    TIMEOUT
  )
}
