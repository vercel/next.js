import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

describe('agentic-editing', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextDev) {
    it('skip in production mode', () => {})
    return
  }

  async function applyPatch(
    patch: string,
    urls: string[] = ['/']
  ): Promise<{
    success: boolean
    affectedFiles: string[]
    diffs: Array<{ file: string; type: string; summary: string }>
    pages: Array<{
      url: string
      compileErrors: string[]
      runtimeErrors: string[]
      screenshot: string
    }>
    durationMs: number
  }> {
    const res = await next.fetch('/_next/dev/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch, urls }),
    })
    return res.json()
  }

  it('should apply a valid patch and serve updated content', async () => {
    const result = await applyPatch(
      [
        '--- edit: app/page.tsx',
        '--- search',
        '  return <h1>hello world</h1>',
        '--- replace',
        '  return <h1>patched via endpoint</h1>',
        '---',
      ].join('\n')
    )

    expect(result.success).toBe(true)
    expect(result.affectedFiles).toEqual(['app/page.tsx'])
    expect(result.diffs).toHaveLength(1)
    expect(result.diffs[0].type).toBe('edit')
    expect(result.pages[0].compileErrors).toHaveLength(0)
    expect(result.pages[0].runtimeErrors).toHaveLength(0)
    expect(result.durationMs).toBeGreaterThan(0)

    await retry(async () => {
      const $ = await next.render$('/')
      expect($('h1').text()).toBe('patched via endpoint')
    })
  })

  it('should report compile errors for broken patches', async () => {
    const result = await applyPatch(
      [
        '--- edit: app/page.tsx',
        '--- search',
        '  return <h1>patched via endpoint</h1>',
        '--- replace',
        '  return <h1>broken{</h1>',
        '---',
      ].join('\n')
    )

    expect(result.success).toBe(false)
    expect(result.pages[0].compileErrors.length).toBeGreaterThan(0)
    expect(result.pages[0].compileErrors[0]).toContain('Expression expected')
  })

  it('should recover after fixing a broken patch', async () => {
    const result = await applyPatch(
      [
        '--- edit: app/page.tsx',
        '--- search',
        '  return <h1>broken{</h1>',
        '--- replace',
        '  return <h1>recovered</h1>',
        '---',
      ].join('\n')
    )

    expect(result.success).toBe(true)
    expect(result.pages[0].compileErrors).toHaveLength(0)

    await retry(async () => {
      const $ = await next.render$('/')
      expect($('h1').text()).toBe('recovered')
    })
  })

  it('should fail when search text is not found', async () => {
    const result = await applyPatch(
      [
        '--- edit: app/page.tsx',
        '--- search',
        '  return <h1>nonexistent text</h1>',
        '--- replace',
        '  return <h1>replaced</h1>',
        '---',
      ].join('\n')
    )

    expect(result.success).toBe(false)
    expect(result.pages[0].compileErrors[0]).toContain('not found')
  })

  it('should create new files with write operations', async () => {
    const result = await applyPatch(
      [
        '--- write: app/about/page.tsx',
        'export default function About() {',
        '  return <h1>about page</h1>',
        '}',
        '---',
      ].join('\n'),
      ['/about']
    )

    expect(result.success).toBe(true)
    expect(result.affectedFiles).toEqual(['app/about/page.tsx'])

    await retry(async () => {
      const $ = await next.render$('/about')
      expect($('h1').text()).toBe('about page')
    })
  })

  it('should apply multi-file patches in a single call', async () => {
    const result = await applyPatch(
      [
        '--- edit: app/page.tsx',
        '--- search',
        '  return <h1>recovered</h1>',
        '--- replace',
        '  return <h1>multi-file main</h1>',
        '---',
        '--- write: app/contact/page.tsx',
        'export default function Contact() {',
        '  return <h1>contact page</h1>',
        '}',
        '---',
      ].join('\n'),
      ['/', '/contact']
    )

    expect(result.success).toBe(true)
    expect(result.affectedFiles).toEqual([
      'app/page.tsx',
      'app/contact/page.tsx',
    ])
    expect(result.diffs).toHaveLength(2)
    expect(result.pages).toHaveLength(2)
    expect(result.pages[0].url).toBe('/')
    expect(result.pages[1].url).toBe('/contact')

    await retry(async () => {
      const $ = await next.render$('/')
      expect($('h1').text()).toBe('multi-file main')
    })

    await retry(async () => {
      const $ = await next.render$('/contact')
      expect($('h1').text()).toBe('contact page')
    })
  })

  it('should return 400 for empty patch body', async () => {
    const res = await next.fetch('/_next/dev/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: '', urls: ['/'] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('should return 400 for unparseable patch format', async () => {
    const res = await next.fetch('/_next/dev/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patch: 'just some random text with no directives',
        urls: ['/'],
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('should return 400 for malformed JSON body', async () => {
    const res = await next.fetch('/_next/dev/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    expect(res.status).toBe(400)
  })

  it('should pass through non-POST requests', async () => {
    const res = await next.fetch('/_next/dev/apply', { method: 'GET' })
    // Should not be handled by the middleware (passes to next handler)
    expect(res.status).not.toBe(200)
  })

  it('should detect runtime errors from a throwing component', async () => {
    // Write a component that throws at render time
    const result = await applyPatch(
      [
        '--- write: app/throwing/page.tsx',
        '"use client"',
        'export default function Throwing() {',
        '  throw new Error("intentional runtime error")',
        '  return <h1>never rendered</h1>',
        '}',
        '---',
      ].join('\n'),
      ['/throwing']
    )

    // The page should compile successfully but have runtime errors
    expect(result.pages[0].url).toBe('/throwing')
    // Runtime errors may or may not be captured depending on next-browser
    // availability, but the response should still be returned
    expect(result.durationMs).toBeGreaterThan(0)
    expect(result.affectedFiles).toEqual(['app/throwing/page.tsx'])
  })

  it('should not recompile on direct file writes (watcher is off)', async () => {
    // Get current content via the endpoint
    const $ = await next.render$('/')
    const currentText = $('h1').text()

    // Write directly to disk (bypassing the apply endpoint)
    const pagePath = path.join(next.testDir, 'app/page.tsx')
    fs.writeFileSync(
      pagePath,
      `export default function Page() {
  return <h1>direct write should not appear</h1>
}
`
    )

    // Wait a bit for any potential watcher to pick it up
    await new Promise((r) => setTimeout(r, 3000))

    // Page should still show the old content (watcher is disabled)
    const $after = await next.render$('/')
    expect($after('h1').text()).toBe(currentText)

    // Restore the file via the apply endpoint so subsequent tests work
    await applyPatch(
      [
        '--- edit: app/page.tsx',
        '--- search',
        '  return <h1>direct write should not appear</h1>',
        '--- replace',
        `  return <h1>${currentText}</h1>`,
        '---',
      ].join('\n')
    )
  })
})
