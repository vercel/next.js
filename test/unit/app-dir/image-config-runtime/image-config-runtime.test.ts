import { imageConfigDefault } from 'next/dist/shared/lib/image-config'

type Registry =
  typeof import('next/dist/shared/lib/image-config-runtime.external')
type Facade = typeof import('next/dist/shared/lib/image-config-runtime')

function loadRegistry(): Registry {
  let registry!: Registry
  jest.isolateModules(() => {
    registry = require('next/dist/shared/lib/image-config-runtime.external')
  })
  return registry
}

function createConfig() {
  return {
    ...imageConfigDefault,
    deviceSizes: [1080, 640],
    imageSizes: [256, 128],
    qualities: [90, 60],
    output: 'export' as const,
  }
}

function expectPreparedConfig(
  config: ReturnType<typeof createConfig>,
  actual: ReturnType<Registry['getImageConfig']>
) {
  expect(actual).not.toBe(config)
  expect(actual.deviceSizes).toEqual([640, 1080])
  expect(actual.imageSizes).toEqual([256, 128])
  expect(actual.allSizes).toEqual([128, 256, 640, 1080])
  expect(actual.qualities).toEqual([60, 90])
  expect(actual.deviceSizes).not.toBe(config.deviceSizes)
  expect(actual.imageSizes).not.toBe(config.imageSizes)
  expect(actual.qualities).not.toBe(config.qualities)
  expect(config.deviceSizes).toEqual([1080, 640])
  expect(config.imageSizes).toEqual([256, 128])
  expect(config.qualities).toEqual([90, 60])
}

afterEach(() => jest.restoreAllMocks())

describe('external image config registration', () => {
  it('reads later registration through an earlier canonical facade import', () => {
    let facade!: Facade
    let registry!: Registry
    jest.isolateModules(() => {
      facade = require('next/dist/shared/lib/image-config-runtime')
      registry = require('next/dist/shared/lib/image-config-runtime.external')
    })

    expect(facade.getImageConfig().deviceSizes).toEqual(
      imageConfigDefault.deviceSizes
    )
    const config = createConfig()
    registry.registerImageConfig(config)
    const prepared = facade.getImageConfig()
    expectPreparedConfig(config, prepared)
    expect(facade.getImageConfig()).toBe(prepared)
  })

  it('reads the registered options after an earlier default read', () => {
    const registry = loadRegistry()
    expect(registry.getImageConfig().deviceSizes).toEqual(
      imageConfigDefault.deviceSizes
    )
    const config = createConfig()
    registry.registerImageConfig(config)
    const prepared = registry.getImageConfig()
    expectPreparedConfig(config, prepared)
    expect(registry.getImageConfig()).toBe(prepared)
  })

  it('accepts equivalent cloned options without warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation()
    const registry = loadRegistry()
    const config = createConfig()
    registry.registerImageConfig(config)
    registry.registerImageConfig({
      ...config,
      deviceSizes: [...config.deviceSizes],
      imageSizes: [...config.imageSizes],
      qualities: [...config.qualities],
    })
    expectPreparedConfig(config, registry.getImageConfig())
    expect(warn).not.toHaveBeenCalled()
  })

  it('prepares owned mutable arrays from frozen source options', () => {
    const registry = loadRegistry()
    const config = createConfig()
    Object.freeze(config.deviceSizes)
    Object.freeze(config.imageSizes)
    Object.freeze(config.qualities)
    Object.freeze(config)

    registry.registerImageConfig(config)
    const prepared = registry.getImageConfig()
    expectPreparedConfig(config, prepared)
    expect(Object.isFrozen(prepared.deviceSizes)).toBe(false)
    expect(Object.isFrozen(prepared.imageSizes)).toBe(false)
    expect(Object.isFrozen(prepared.qualities)).toBe(false)
  })

  it('warns on first use after conflicting registrations', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation()
    const registry = loadRegistry()
    const first = createConfig()
    registry.registerImageConfig(first)
    registry.registerImageConfig({ ...first, deviceSizes: [750] })
    expect(warn).not.toHaveBeenCalled()
    const prepared = registry.getImageConfig()
    expectPreparedConfig(first, prepared)
    expect(registry.getImageConfig()).toBe(prepared)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Conflicting image options')
    )
  })

  it('warns when a conflicting registration follows first use', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation()
    const registry = loadRegistry()
    const first = createConfig()
    registry.registerImageConfig(first)
    const prepared = registry.getImageConfig()
    expectPreparedConfig(first, prepared)
    registry.registerImageConfig({ ...first, qualities: [75] })
    expect(registry.getImageConfig()).toBe(prepared)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
