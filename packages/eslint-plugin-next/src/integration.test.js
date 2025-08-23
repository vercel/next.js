const plugin = require('../dist/index.js')

describe('eslint-plugin-next integration', () => {
  it('should export the plugin as default', () => {
    // === Example eslint.config.mjs ===
    //
    // import { defineConfig } from 'eslint/config'
    // import eslintPluginNext from '@next/eslint-plugin-next'
    //
    // export default defineConfig([
    //   {
    //     files: ['**/*.js'],
    //     plugins: {
    //       example: eslintPluginNext,
    //     },
    //     extends: [eslintPluginNext.configs.recommended],
    //   },
    // ])

    const eslintPluginNext = plugin.default

    // Verify the plugin can be used as shown in the example
    expect(eslintPluginNext).toBeDefined()
    expect(typeof eslintPluginNext).toBe('object')

    // Test plugin object structure
    expect(eslintPluginNext.rules).toBeDefined()
    expect(eslintPluginNext.configs).toBeDefined()
    expect(eslintPluginNext.configs.recommended).toBeDefined()
    expect(eslintPluginNext.configs['core-web-vitals']).toBeDefined()

    // Test that the plugin can be used in the plugins field
    const pluginConfig = {
      plugins: {
        example: eslintPluginNext,
      },
    }

    expect(pluginConfig.plugins.example).toBe(eslintPluginNext)
    expect(pluginConfig.plugins.example.rules).toBeDefined()

    // Test that the configs exist and have expected properties
    const recommendedConfig = eslintPluginNext.configs.recommended
    expect(recommendedConfig).toBeDefined()
    expect(recommendedConfig.plugins).toEqual(['@next/next'])
    expect(recommendedConfig.rules).toBeDefined()
    expect(typeof recommendedConfig.rules).toBe('object')

    // Test specific rule existence
    expect(eslintPluginNext.rules['google-font-display']).toBeDefined()
    expect(eslintPluginNext.rules['no-img-element']).toBeDefined()
    expect(eslintPluginNext.rules['no-html-link-for-pages']).toBeDefined()
  })

  it('should support flat config spread pattern via named export', () => {
    const { flatConfig } = plugin

    // Test flat config usage
    const modernConfig = [
      {
        files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
        ...flatConfig.recommended,
      },
    ]

    expect(modernConfig[0].name).toBe('next/recommended')
    expect(modernConfig[0].plugins).toBeDefined()
    expect(modernConfig[0].plugins['@next/next']).toBeDefined()
    expect(modernConfig[0].rules).toBeDefined()
  })
})
