/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import loadConfig from 'next/dist/next-server/server/config'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const pathToConfig = join(__dirname, '_resolvedata', 'without-function')
const pathToConfigFn = join(__dirname, '_resolvedata', 'with-function')

fixture('config')

test('Should get the configuration', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfig)
  await t.expect(config.customConfig).eql(true)
})

test('Should pass the phase correctly', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
  await t.expect(config.phase).eql(PHASE_DEVELOPMENT_SERVER)
})

test('Should pass the defaultConfig correctly', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
  await t.expect(typeof config.defaultConfig).notEql('undefined')
})

test('Should assign object defaults deeply to user config', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
  await t.expect(config.distDir).eql('.next')
  await t
    .expect(typeof config.onDemandEntries.maxInactiveAge)
    .notEql('undefined')
})

test('Should pass the customConfig correctly', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
    customConfig: true
  })
  await t.expect(config.customConfig).eql(true)
})

test('Should not pass the customConfig when it is null', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, null, null)
  await t.expect(config.webpack).eql(null)
})

test('Should assign object defaults deeply to customConfig', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
    customConfig: true,
    onDemandEntries: { custom: true }
  })
  await t.expect(config.customConfig).eql(true)
  await t
    .expect(typeof config.onDemandEntries.maxInactiveAge)
    .notEql('undefined')
})

test('Should allow setting objects which do not have defaults', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
    bogusSetting: { custom: true }
  })
  await t.expect(typeof config.bogusSetting).notEql('undefined')
  await t.expect(config.bogusSetting.custom).eql(true)
})

test('Should override defaults for arrays from user arrays', async t => {
  const config = loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
    pageExtensions: ['.bogus']
  })
  await t.expect(config.pageExtensions).eql(['.bogus'])
})

test('Should throw when an invalid target is provided', async t => {
  try {
    loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      join(__dirname, '_resolvedata', 'invalid-target')
    )
    // makes sure we don't just pass if the loadConfig passes while it should fail
    throw new Error('failed')
  } catch (err) {
    await t.expect(err.message).match(/Specified target is invalid/)
  }
})

test('Should pass when a valid target is provided', async t => {
  const config = loadConfig(
    PHASE_DEVELOPMENT_SERVER,
    join(__dirname, '_resolvedata', 'valid-target')
  )
  await t.expect(config.target).eql('serverless')
})
