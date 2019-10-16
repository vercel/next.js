/* global fixture, test */
import 'testcafe'

import path from 'path'
import {
  exists,
  remove,
  readFile,
  readJSON,
  writeJSON,
  createFile
} from 'fs-extra'

import {
  launchApp,
  findPort,
  killApp,
  renderViaHTTP,
  didThrow
} from 'next-test-utils'

const appDir = path.join(__dirname, '../')
const tsConfig = path.join(appDir, 'tsconfig.json')

fixture('Fork ts checker plugin')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
    await remove(tsConfig)
  })

test('Creates a default tsconfig.json when one is missing', async t => {
  await t.expect(await exists(tsConfig)).eql(true)

  const tsConfigContent = await readFile(tsConfig)
  let parsedTsConfig
  await didThrow(() => {
    parsedTsConfig = JSON.parse(tsConfigContent)
  }, false)

  await t.expect(parsedTsConfig.exclude[0]).eql('node_modules')
})

test('Works with an empty tsconfig.json (docs)', async t => {
  await killApp(t.fixtureCtx.app)

  await remove(tsConfig)
  await new Promise(resolve => setTimeout(resolve, 500))

  await t.expect(await exists(tsConfig)).eql(false)

  await createFile(tsConfig)
  await new Promise(resolve => setTimeout(resolve, 500))

  await t.expect(await readFile(tsConfig, 'utf8')).eql('')

  await killApp(t.fixtureCtx.app)
  await new Promise(resolve => setTimeout(resolve, 500))

  t.fixtureCtx.appPort = await findPort()
  t.fixtureCtx.app = await launchApp(appDir, t.fixtureCtx.appPort)

  const tsConfigContent = await readFile(tsConfig)
  let parsedTsConfig
  await didThrow(() => {
    parsedTsConfig = JSON.parse(tsConfigContent)
  }, false)

  await t.expect(parsedTsConfig.exclude[0]).eql('node_modules')
})

test('Updates an existing tsconfig.json with required value', async t => {
  await killApp(t.fixtureCtx.app)

  let parsedTsConfig = await readJSON(tsConfig)
  parsedTsConfig.compilerOptions.esModuleInterop = false

  await writeJSON(tsConfig, parsedTsConfig)
  t.fixtureCtx.appPort = await findPort()
  t.fixtureCtx.app = await launchApp(appDir, t.fixtureCtx.appPort)

  parsedTsConfig = await readJSON(tsConfig)
  await t.expect(parsedTsConfig.compilerOptions.esModuleInterop).eql(true)
})

test('Renders a TypeScript page correctly', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/Hello TypeScript/)
})
