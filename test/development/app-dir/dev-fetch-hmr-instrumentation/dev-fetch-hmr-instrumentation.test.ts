import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dev-fetch-hmr-instrumentation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test: resetFetch() in router-server.ts used to restore a
  // snapshot of globalThis.fetch taken at startup — before instrumentation.ts
  // had a chance to wrap it. Every HMR event would therefore strip any
  // third-party fetch instrumentation (e.g. @vercel/otel trace-context
  // propagation). The fix makes resetFetch() unwrap only the Next.js
  // patchFetch() layer via _nextPrePatchFetch, preserving instrumentation.
  it('should preserve instrumentation fetch wrapping after HMR', async () => {
    // 1. Cold start: instrumentation.ts wraps fetch, the probe should work.
    const $ = await next.render$('/')
    expect($('#instrumented').text()).toBe('yes')

    // 2. Trigger HMR by editing the page component.
    await next.patchFile('app/page.tsx', (content) =>
      content.replace('touch to trigger HMR', 'touch to trigger HMR 2')
    )

    // 3. After HMR, the instrumentation wrapper must still be active.
    await retry(async () => {
      const $2 = await next.render$('/')
      // Confirm HMR actually happened
      expect($2('#update').text()).toBe('touch to trigger HMR 2')
      // Confirm instrumentation survived
      expect($2('#instrumented').text()).toBe('yes')
    })
  })
})
