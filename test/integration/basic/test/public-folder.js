/* global test */
import 'testcafe'
import { renderViaHTTP } from 'next-test-utils'

export default () => {
  test('should allow access to public files', async t => {
    const data = await renderViaHTTP(t.fixtureCtx.appPort, '/data/data.txt')
    await t.expect(data).eql('data')

    const legacy = await renderViaHTTP(
      t.fixtureCtx.appPort,
      '/static/legacy.txt'
    )
    await t.expect(legacy).contains(`new static folder`)
  })
}
