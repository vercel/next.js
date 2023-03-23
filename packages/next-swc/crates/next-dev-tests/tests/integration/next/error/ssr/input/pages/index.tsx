import { useEffect, useRef } from 'react'

export default function Page() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const appIframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then((mod) =>
      runTests(mod, iframeRef.current!, appIframeRef.current)
    )
  })

  return (
    <>
      <iframe
        style={{ width: 800, height: 600 }}
        src="/broken"
        ref={iframeRef}
      />
      <iframe
        style={{ width: 800, height: 600 }}
        src="/broken-app"
        ref={appIframeRef}
      />
    </>
  )
}

type Harness = typeof import('@turbo/pack-test-harness')

function runTests(
  harness: Harness,
  iframe: HTMLIFrameElement,
  appIframe: HTMLIFrameElement
) {
  const TIMEOUT = 40000

  it(
    'returns a 500 status code',
    async () => {
      const res = await fetch('/broken')
      expect(res.status).toBe(500)
    },
    TIMEOUT
  )

  it(
    'should show error overlay for a broken page',
    async () => {
      await harness.waitForLoaded(iframe)
      const errorOverlay = await harness.waitForErrorOverlay(iframe)
      const issues = await harness.waitForSelector(
        errorOverlay,
        '#turbopack-issues'
      )
      expect(issues.innerHTML).toContain('Error during SSR Rendering')
      expect(issues.innerHTML).toContain('Error: Broken page (expected error)')
      expect(issues.innerHTML).toContain('input/pages/broken.tsx:2')
      expect(issues.innerHTML).toContain(
        "throw new Error('Broken page (expected error)')"
      )
    },
    TIMEOUT
  )

  it(
    'should show error overlay for a broken app page',
    async () => {
      await harness.waitForLoaded(appIframe)
      const errorOverlay = await harness.waitForErrorOverlay(appIframe)
      const issues = await harness.waitForSelector(
        errorOverlay,
        '#runtime-errors'
      )
      expect(issues.innerHTML).toContain('Error: Broken app (expected error)')
      // TODO(WEB-781): Fix this
      // expect(issues.innerHTML).toContain('input/app/broken-app/page.tsx:2')
      // expect(issues.innerHTML).toContain("throw new Error('Broken app ')")
    },
    TIMEOUT
  )
}
