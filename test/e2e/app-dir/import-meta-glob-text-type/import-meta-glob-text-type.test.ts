import { nextTestSetup } from 'e2e-utils'

// `turbopack.rules` is a Turbopack-only feature; skip under webpack
// TODO(deploy-test-completion): No deploy-specific incompatibility is
// documented.
// @force-gate !deploy
// @force-gate turbopack
describe('turbopack `text` / `raw` module types', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load matched files as strings through a `?raw` rule', async () => {
    const $ = await next.render$('/raw')
    const items = $('li')
      .map((_, el) => $(el).text())
      .get()

    expect(items).toEqual([
      './content/delta.txt: delta contents',
      './content/gamma.txt: gamma contents',
    ])
  })

  it('should treat `raw` and `text` the same in a `?raw` rule', async () => {
    const $ = await next.render$('/raw-alias')
    const items = $('li')
      .map((_, el) => $(el).text())
      .get()

    expect(items).toEqual([
      './content/delta.rst: delta contents',
      './content/gamma.rst: gamma contents',
    ])
  })

  it('should treat `raw` and `text` the same for a plain import', async () => {
    const $ = await next.render$('/alias')

    expect(JSON.parse($('#raw').text())).toBe('# alpha\n\nsome markdown\n')
    expect($('#equal').text()).toBe('true')
  })
})
