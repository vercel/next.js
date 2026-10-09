import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('import.meta.glob - a broken route must not break the others', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack) {
    it('is turbopack-only', () => {})
    return
  }

  it('should keep unrelated routes working after the broken route compiled', async () => {
    // Before the broken route has ever been requested.
    expect((await next.fetch('/ok-a')).status).toBe(200)
    expect((await next.fetch('/ok-b')).status).toBe(200)

    // Compile the broken route once. It fails with its own error.
    const broken = await next.fetch('/broken')
    expect(broken.status).toBe(500)
    expect(await broken.text()).toContain('gamma.txt')

    // The recorded error belongs to `/broken` only.
    expect((await next.fetch('/ok-a')).status).toBe(200)
    expect((await next.fetch('/ok-b')).status).toBe(200)
  })

  it('should recover the broken route once the glob is removed', async () => {
    await next.patchFile(
      'app/broken/page.tsx',
      `export default function Page() {
        return <p>fixed</p>
      }`,
      async () => {
        await retry(async () => {
          const res = await next.fetch('/broken')
          expect(res.status).toBe(200)
          expect(await res.text()).toContain('fixed')
        })
      }
    )
  })
})
