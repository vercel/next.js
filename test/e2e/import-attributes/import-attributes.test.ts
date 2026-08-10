import { nextTestSetup } from 'e2e-utils'

describe('import-attributes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle json attributes', async () => {
    const esHtml = await next.render('/es')
    const tsHtml = await next.render('/ts')
    // checking json value `foo` is not suffecient, since parse error
    // will include code stack include those values as source
    expect(esHtml).toContain(`<div id="__next">foo</div>`)
    expect(tsHtml).toContain(`<div id="__next">foo</div>`)
  })
})
