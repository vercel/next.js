import { imageConfigDefault } from 'next/dist/shared/lib/image-config'

type Registry =
  typeof import('next/dist/shared/lib/image-config-runtime.external')

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
    deviceSizes: [640, 1080],
    qualities: [60, 90],
    output: 'export' as const,
  }
}

afterEach(() => jest.restoreAllMocks())

describe('external image config registration', () => {
  it('reads the registered options after an earlier default read', () => {
    const registry = loadRegistry()
    expect(registry.getImageConfig().deviceSizes).toEqual(
      imageConfigDefault.deviceSizes
    )
    const config = createConfig()
    registry.registerImageConfig(config)
    expect(registry.getImageConfig()).toBe(config)
  })

  it('accepts equivalent cloned options without warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation()
    const registry = loadRegistry()
    const config = createConfig()
    registry.registerImageConfig(config)
    registry.registerImageConfig({
      ...config,
      deviceSizes: [...config.deviceSizes],
      qualities: [...config.qualities],
    })
    expect(registry.getImageConfig()).toBe(config)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns on first use after conflicting registrations', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation()
    const registry = loadRegistry()
    const first = createConfig()
    registry.registerImageConfig(first)
    registry.registerImageConfig({ ...first, deviceSizes: [750] })
    expect(warn).not.toHaveBeenCalled()
    expect(registry.getImageConfig()).toBe(first)
    expect(registry.getImageConfig()).toBe(first)
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
    expect(registry.getImageConfig()).toBe(first)
    registry.registerImageConfig({ ...first, qualities: [75] })
    expect(registry.getImageConfig()).toBe(first)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
