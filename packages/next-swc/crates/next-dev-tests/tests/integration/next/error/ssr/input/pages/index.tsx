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
  const TIMEOUT = 20000

  it(
    'returns a 500 status code',
    async () => {
      const res = await fetch('/broken')
      expect(res.status).toBe(500)
    },
    TIMEOUT
  )

  it(
    'should show error overlay',
    async () => {
      await harness.waitForLoaded(iframe)
      const errorOverlay = await harness.waitForErrorOverlay(iframe)
      const issues = await harness.waitForSelector(
        errorOverlay,
        '#turbopack-issues'
      )
      expect(issues.innerHTML).toContain('Error during SSR Rendering')
      expect(issues.innerHTML).toContain('Error: Broken page')
      expect(issues.innerHTML).toContain('Debug info:')
      expect(issues.innerHTML).toContain('input/pages/broken.tsx:2')
      expect(issues.innerHTML).toContain("throw new Error('Broken page')")
    },
    TIMEOUT
  )
}
