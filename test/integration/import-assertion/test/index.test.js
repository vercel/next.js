import { join } from 'path'
import {
  nextBuild,
  nextStart,
  launchApp,
  killApp,
  findPort,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')

function runSuite(suiteName, env, runTests) {
  const context = { appDir }
  describe(`${suiteName} ${env}`, () => {
    if (env === 'prod') {
      beforeAll(async () => {
        context.appPort = await findPort()
        await nextBuild(context.appDir)
        context.server = await nextStart(context.appDir, context.appPort)
      })
    }
    if (env === 'dev') {
      beforeAll(async () => {
        context.appPort = await findPort()
        context.server = await launchApp(context.appDir, context.appPort)
      })
    }
    afterAll(async () => await killApp(context.server))

    runTests(context, env)
  })
}

function basic(context) {
  it('should handle json assertions', async () => {
    const esHtml = await renderViaHTTP(context.appPort, '/es')
    const tsHtml = await renderViaHTTP(context.appPort, '/ts')
    expect(esHtml).toContain('foo')
    expect(tsHtml).toContain('foo')
  })
}

runSuite('import-assertion', 'dev', basic)
runSuite('import-assertion', 'prod', basic)
