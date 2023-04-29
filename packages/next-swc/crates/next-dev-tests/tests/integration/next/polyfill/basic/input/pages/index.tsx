import { useEffect, useRef } from 'react'

export default function Page() {
  const pageIframeRef = useRef<HTMLIFrameElement | null>(null)
  const appIframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then((mod) =>
      runTests(mod, pageIframeRef.current!, appIframeRef.current)
    )
  })

  return (
    <>
      <iframe
        style={{ width: 800, height: 600 }}
        src="/app"
        ref={appIframeRef}
      />
      <iframe
        style={{ width: 800, height: 600 }}
        src="/page"
        ref={pageIframeRef}
      />
    </>
  )
}

type Harness = typeof import('@turbo/pack-test-harness')

function runTests(
  harness: Harness,
  page: HTMLIFrameElement,
  app: HTMLIFrameElement
) {
  const TIMEOUT = 30000

  it(
    'should support Buffer on pages',
    async () => {
      await harness.waitForLoaded(page)
      const server = await harness.waitForSelector(page, '#server')
      expect(server.innerHTML).toContain('Hello Server Page')
      const client = await harness.waitForSelector(page, '#client')
      expect(client.innerHTML).toContain('Hello Client Page')
    },
    TIMEOUT
  )

  it(
    'should support Buffer on app',
    async () => {
      await harness.waitForLoaded(app)
      const server = await harness.waitForSelector(app, '#server')
      expect(server.innerHTML).toContain('Hello Server Component')
      const client = await harness.waitForSelector(app, '#client')
      expect(client.innerHTML).toContain('Hello Client Component')
    },
    TIMEOUT
  )
}
