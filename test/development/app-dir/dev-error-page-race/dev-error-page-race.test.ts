import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dev-error-page-race', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle concurrent requests to an erroring page without hanging', async () => {
    // First, verify the page works normally
    const html = await next.render('/')
    expect(html).toContain('hello world')

    // Introduce a syntax error to trigger the fallback error page path
    await next.patchFile('app/page.tsx', 'export default () => <div/')

    // Fire multiple concurrent requests to trigger concurrent ensurePage('/_error') calls.
    // Before the fix, this could cause an invalidation storm in turbopack as multiple
    // tasks raced to write the same error page endpoints with different parameters.
    const results = await Promise.all([
      next.fetch('/'),
      next.fetch('/'),
      next.fetch('/'),
    ])

    // All requests should complete (not hang) and return 500
    for (const res of results) {
      expect(res.status).toBe(500)
    }

    // Fix the error and verify recovery
    await next.patchFile(
      'app/page.tsx',
      `export default function Page() {
  return <p>recovered</p>
}`
    )

    await retry(async () => {
      const recovered = await next.render('/')
      expect(recovered).toContain('recovered')
    })
  })
})
