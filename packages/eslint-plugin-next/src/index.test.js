const plugin = require('../dist/index.js')

describe('eslint-plugin-next exports', () => {
  it('should export the plugin as default export via CommonJS', () => {
    expect(plugin.default).toBeDefined()
    expect(plugin.default.rules).toBeDefined()
    expect(plugin.default.configs).toBeDefined()
  })

  it('should export rules as named export via CommonJS', () => {
    expect(plugin.rules).toBeDefined()
    expect(typeof plugin.rules).toBe('object')
    expect(plugin.rules['google-font-display']).toBeDefined()
  })

  it('should export configs as named export via CommonJS', () => {
    expect(plugin.configs).toBeDefined()
    expect(plugin.configs.recommended).toBeDefined()
    expect(plugin.configs['core-web-vitals']).toBeDefined()
  })

  it('should export flatConfig as named export via CommonJS', () => {
    expect(plugin.flatConfig).toBeDefined()
    expect(plugin.flatConfig.recommended).toBeDefined()
    expect(plugin.flatConfig.coreWebVitals).toBeDefined()
  })

  it('should have correct flat config structure with proper metadata', () => {
    const { flatConfig } = plugin

    // Test recommended config structure
    expect(flatConfig.recommended.name).toBe('next/recommended')
    expect(flatConfig.recommended.plugins).toBeDefined()
    expect(flatConfig.recommended.plugins['@next/next']).toBeDefined()
    expect(flatConfig.recommended.rules).toBeDefined()

    // Test core web vitals config structure
    expect(flatConfig.coreWebVitals.name).toBe('next/core-web-vitals')
    expect(flatConfig.coreWebVitals.plugins).toBeDefined()
    expect(flatConfig.coreWebVitals.plugins['@next/next']).toBeDefined()
    expect(flatConfig.coreWebVitals.rules).toBeDefined()
  })

  it('should support CommonJS usage pattern with default export access', () => {
    // Test CommonJS consumers can access the default export and use it properly
    const pluginDefault = plugin.default

    const configExample = {
      files: ['**/*.js'],
      plugins: {
        example: pluginDefault,
      },
    }

    expect(configExample.plugins.example).toBeDefined()
    expect(configExample.plugins.example.rules).toBeDefined()
    expect(configExample.plugins.example.configs).toBeDefined()

    // Test that specific rules exist
    expect(pluginDefault.rules['google-font-display']).toBeDefined()
    expect(pluginDefault.rules['no-img-element']).toBeDefined()
    expect(pluginDefault.rules['no-html-link-for-pages']).toBeDefined()

    // Test configs structure
    const recommendedConfig = pluginDefault.configs.recommended
    expect(recommendedConfig).toBeDefined()
    expect(recommendedConfig.plugins).toEqual(['@next/next'])
    expect(recommendedConfig.rules).toBeDefined()
    expect(typeof recommendedConfig.rules).toBe('object')
  })
})
