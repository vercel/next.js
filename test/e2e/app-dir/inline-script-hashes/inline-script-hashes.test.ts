import { createHash } from 'crypto'
import { nextTestSetup } from 'e2e-utils'

const INLINE_SCRIPT_REGEX =
  /<script(?![^>]*\ssrc[\s=])[^>]*>([\s\S]*?)<\/script\s*>/g

function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>()

  for (const [, body] of html.matchAll(INLINE_SCRIPT_REGEX)) {
    if (!body) continue

    hashes.add(
      `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
    )
  }

  return Array.from(hashes)
}

async function policyOf(res: Response): Promise<string> {
  const policy = res.headers.get('content-security-policy')

  expect(policy).not.toBeNull()

  return policy as string
}

describe('inline script hashes', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  // The hashes are known once the document is complete, which only happens for
  // a response that is cached; the development server serves every request from
  // a fresh render and streams it.
  if (isNextDev) {
    it('leaves the policy alone in development', async () => {
      const res = await next.fetch('/')

      expect(await policyOf(res)).toBe("default-src 'self'; script-src 'self'")
    })

    return
  }

  it('admits every inline script of a prerendered page', async () => {
    const res = await next.fetch('/')
    const policy = await policyOf(res)
    const hashes = inlineScriptHashes(await res.text())

    expect(hashes.length).toBeGreaterThan(0)
    expect(policy).not.toContain("'unsafe-inline'")

    for (const hash of hashes) {
      expect(policy).toContain(hash)
    }
  })

  it('admits the inline scripts of a page rendered on demand', async () => {
    const res = await next.fetch('/on-demand/first')
    const policy = await policyOf(res)
    const hashes = inlineScriptHashes(await res.text())

    expect(hashes.length).toBeGreaterThan(0)

    for (const hash of hashes) {
      expect(policy).toContain(hash)
    }
  })

  it('serves the same policy and body from the cache', async () => {
    const first = await next.fetch('/on-demand/second')
    const firstPolicy = await policyOf(first)
    const firstHtml = await first.text()

    const second = await next.fetch('/on-demand/second')
    const secondPolicy = await policyOf(second)

    expect(await second.text()).toBe(firstHtml)
    expect(secondPolicy).toBe(firstPolicy)
  })

  it('leaves a policy that carries unsafe-inline alone', async () => {
    const res = await next.fetch('/unsafe-inline')

    expect(await policyOf(res)).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'"
    )
  })
})
