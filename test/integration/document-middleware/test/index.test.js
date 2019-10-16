/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

fixture('Document middleware')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(join(__dirname, '../'), ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('should render a page without error', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/hi there/i)
})

test('should set header in middleware and still render', async t => {
  const res = await fetchViaHTTP(t.fixtureCtx.appPort, '/')
  const html = await res.text()
  const header = res.headers.get('next-middleware')

  await t.expect(html).match(/hi there/i)
  await t.expect(header).eql('hi from middleware')
})

test('should set header and abort render on res.end()', async t => {
  const res = await fetchViaHTTP(t.fixtureCtx.appPort, '/another')
  const html = (await res.text()) || ''
  const header = res.headers.get('next-middleware')

  await t.expect(html.length).eql(0)
  await t.expect(header).eql('hit another!')
})
