/* global fixture,test */
import { t } from 'testcafe'
import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suits
import rendering from './rendering'
import client from './client'
import csp from './csp'

fixture('Document and App')
  .before(async ctx => {
    ctx.output = ''
    const collectOutput = msg => {
      ctx.output += msg || ''
    }

    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort, {
      onStdout: collectOutput,
      onStderr: collectOutput
    })

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(ctx.appPort, '/')])
  })
  .after(ctx => killApp(ctx.server))

test('should not have any missing key warnings', async t => {
  await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t
    .expect(t.fixtureCtx.output)
    .notMatch(/Each child in a list should have a unique "key" prop/)
})

const render = (path, query) => {
  return renderViaHTTP(t.fixtureCtx.appPort, path, query)
}

rendering(render)
client()
csp()
