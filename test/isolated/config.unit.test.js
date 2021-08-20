/* eslint-env jest */

import { join } from 'path'
import loadConfig from 'next/dist/server/config'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const pathToConfig = join(__dirname, '_resolvedata', 'without-function')
const pathToConfigFn = join(__dirname, '_resolvedata', 'with-function')

describe('config', () => {
  it('Should get the configuration', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfig)
    expect(config.customConfig).toBe(true)
  })

  it('Should pass the phase correctly', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect(config.phase).toBe(PHASE_DEVELOPMENT_SERVER)
  })

  it('Should pass the defaultConfig correctly', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect(config.defaultConfig).toBeDefined()
  })

  it('Should assign object defaults deeply to user config', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect(config.distDir).toEqual('.next')
    expect(config.onDemandEntries.maxInactiveAge).toBeDefined()
  })

  it('Should pass the customConfig correctly', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
      customConfig: true,
    })
    expect(config.customConfig).toBe(true)
  })

  it('Should not pass the customConfig when it is null', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, null, null)
    expect(config.webpack).toBe(null)
  })

  it('Should assign object defaults deeply to customConfig', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
      customConfig: true,
      onDemandEntries: { custom: true },
    })
    expect(config.customConfig).toBe(true)
    expect(config.onDemandEntries.maxInactiveAge).toBeDefined()
  })

  it('Should allow setting objects which do not have defaults', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
      bogusSetting: { custom: true },
    })
    expect(config.bogusSetting).toBeDefined()
    expect(config.bogusSetting.custom).toBe(true)
  })

  it('Should override defaults for arrays from user arrays', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
      pageExtensions: ['.bogus'],
    })
    expect(config.pageExtensions).toEqual(['.bogus'])
  })

  it('Should throw when an invalid target is provided', async () => {
    await expect(async () => {
      await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        join(__dirname, '_resolvedata', 'invalid-target')
      )
    }).rejects.toThrow(/Specified target is invalid/)
  })

  it('Should pass when a valid target is provided', async () => {
    const config = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      join(__dirname, '_resolvedata', 'valid-target')
    )
    expect(config.target).toBe('serverless')
  })

  it('Should throw an error when next.config.js is not present', async () => {
    await expect(
      async () =>
        await loadConfig(
          PHASE_DEVELOPMENT_SERVER,
          join(__dirname, '_resolvedata', 'typescript-config')
        )
    ).rejects.toThrow(
      /Configuring Next.js via .+ is not supported. Please replace the file with 'next.config.js'/
    )
  })

  it('Should not throw an error when two versions of next.config.js are present', async () => {
    const config = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      join(__dirname, '_resolvedata', 'js-ts-config')
    )
    expect(config.__test__ext).toBe('js')
  })

  it('Should ignore configs set to `undefined`', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
      target: undefined,
    })
    expect(config.target).toBe('server')
  })

  it('Should ignore configs set to `null`', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, null, {
      target: null,
    })
    expect(config.target).toBe('server')
  })
})
