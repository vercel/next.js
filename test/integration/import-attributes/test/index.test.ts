import { join } from 'path'
import { renderViaHTTP, runDevSuite, runProdSuite } from 'next-test-utils'

const appDir = join(__dirname, '../')

function basic(context) {
  it('should handle json attributes', async () => {
    const esHtml = await renderViaHTTP(context.appPort, '/es')
    const tsHtml = await renderViaHTTP(context.appPort, '/ts')
    // checking json value `foo` is not suffecient, since parse error
    // will include code stack include those values as source
    expect(esHtml).toContain(`<div id="__next">foo</div>`)
    expect(tsHtml).toContain(`<div id="__next">foo</div>`)
  })
}

runDevSuite('import-attributes', appDir, { runTests: basic })
runProdSuite('import-attributes', appDir, { runTests: basic })
