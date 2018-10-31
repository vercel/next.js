/* eslint-env jest */
import fsTimeMachine from 'fs-time-machine'
import { runNextDev } from 'next-test-utils'
import { setDefaultOptions } from 'expect-puppeteer'

jest.setTimeout(1000 * 60)
setDefaultOptions({ timeout: 1000 * 60 })

describe('Basic Features', () => {
  beforeAll(async () => {
    global.server = await runNextDev(__dirname)

    // Prebuild the following pages
    await Promise.all([
      '/async-props',
      '/default-head',
      '/empty-get-initial-props',
      '/error',
      '/finish-response',
      '/head',
      '/json',
      '/link',
      '/stateless',
      '/fragment-syntax',
      '/custom-extension',
      '/styled-jsx',
      '/with-cdm',
      '/url-prop',
      '/url-prop-override',
      '/process-env',
      '/nav',
      '/nav/about',
      '/nav/on-click',
      '/nav/querystring',
      '/nav/self-reload',
      '/nav/hash-changes',
      '/nav/shallow-routing',
      '/nav/redirect',
      '/nav/as-path',
      '/nav/as-path-using-router',
      '/nav/url-prop-change',
      '/nested-cdm/index',
      '/hmr/about',
      '/hmr/style',
      '/hmr/contact',
      '/hmr/counter'
    ].map(path => global.server.fetch(path)))
  })
  afterAll(() => global.server.close())
  afterEach(fsTimeMachine.restore)

  describe('Rendering via HTTP', () => require('./test/rendering-via-http'))
  describe('Client Navigation', () => require('./test/client-navigation'))
  describe('Dynamic import', () => require('./test/dynamic-import'))
  describe('Hot Module Reloading', () => require('./test/hot-module-reloading'))

  // hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  // errorRecovery(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  // asset(context)
  // processEnv(context)
})
