import { nextTestSetup } from 'e2e-utils'

describe('import.meta.glob - query matched by a module type rule', () => {
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
})
