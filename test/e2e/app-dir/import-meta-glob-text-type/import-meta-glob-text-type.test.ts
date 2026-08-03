import { nextTestSetup } from 'e2e-utils'

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
      './content/delta.log: delta contents',
      './content/gamma.log: gamma contents',
    ])
  })

  it('should treat `raw` and `text` the same for a plain import', async () => {
    const $ = await next.render$('/alias')

    expect(JSON.parse($('#raw').text())).toBe('# alpha\n\nsome markdown\n')
    expect($('#equal').text()).toBe('true')
  })
})
