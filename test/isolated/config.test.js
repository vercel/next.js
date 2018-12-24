/* eslint-env jest */

import {join} from 'path'
import loadConfig from 'next-server/next-config'
import {PHASE_DEVELOPMENT_SERVER} from 'next-server/constants'

const pathToConfig = join(__dirname, '_resolvedata', 'without-function')
const pathToConfigFn = join(__dirname, '_resolvedata', 'with-function')

describe('config', () => {
  it('Should get the configuration', () => {
    const config = loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfig)
    expect(config.customConfig).toBe(true)
  })

  it('Should pass the phase correctly', () => {
    const config = loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect(config.phase).toBe(PHASE_DEVELOPMENT_SERVER)
  })

  it('Should pass the defaultConfig correctly', () => {
    const config = loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect(config.defaultConfig).toBeDefined()
  })

  it('Should pass the customConfig correctly', () => {
    const config = loadConfig(PHASE_DEVELOPMENT_SERVER, null, {customConfig: true})
    expect(config.customConfig).toBe(true)
  })

  it('Should not pass the customConfig when it is null', () => {
    const config = loadConfig(PHASE_DEVELOPMENT_SERVER, null, null)
    expect(config.webpack).toBe(null)
  })

  it('Should throw when an invalid target is provided', () => {
    try {
      loadConfig(PHASE_DEVELOPMENT_SERVER, join(__dirname, '_resolvedata', 'invalid-target'))
      // makes sure we don't just pass if the loadConfig passes while it should fail
      throw new Error('failed')
    } catch (err) {
      expect(err.message).toMatch(/Specified target is invalid/)
    }
  })

  it('Should pass when a valid target is provided', () => {
    const config = loadConfig(PHASE_DEVELOPMENT_SERVER, join(__dirname, '_resolvedata', 'valid-target'))
    expect(config.target).toBe('serverless')
  })
})
