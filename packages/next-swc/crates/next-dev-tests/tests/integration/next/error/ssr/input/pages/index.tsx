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
    <iframe style={{ width: 800, height: 600 }} src="/broken" ref={iframeRef} />
  )
}

type Harness = typeof import('@turbo/pack-test-harness')

function runTests(harness: Harness, iframe: HTMLIFrameElement) {
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
    },
    TIMEOUT
  )
}
