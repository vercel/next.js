import { nextTestSetup } from 'e2e-utils'

describe('nested-dynamic-components', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page with nested dynamic components', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Nested Dynamic Components Test')
    expect($('.dynamic-component').length).toBe(2)
  })

  it('should only reference emitted chunks', async () => {
    const $ = await next.render$('/')
    const chunks = new Set(
      $('link[rel="preload"][as="script"], script[src]')
        .toArray()
        .map((el) => el.attribs.href ?? el.attribs.src)
    )
    expect(chunks.size).toBeGreaterThan(0)
    for (const chunk of chunks) {
      const { status } = await next.fetch(chunk)
      expect({ chunk, status }).toEqual({ chunk, status: 200 })
    }
  })

  // Turbopack writes a react-loadable-manifest per page.
  // @force-gate turbopack
  it('should only list emitted files in the react-loadable-manifest', async () => {
    await next.render('/')

    const manifest: Record<string, { files: string[] }> = JSON.parse(
      await next.readFile(
        '.next/dev/server/pages/index/react-loadable-manifest.json'
      )
    )
    const entries = Object.values(manifest)
    expect(entries.length).toBeGreaterThan(0)

    const missing: string[] = []
    for (const { files } of entries) {
      for (const file of files) {
        if (!(await next.hasFile(`.next/dev/${file}`))) {
          missing.push(file)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
