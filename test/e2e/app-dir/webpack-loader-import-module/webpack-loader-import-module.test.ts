import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-import-module', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should support this.importModule() in a webpack loader', async () => {
    const $ = await next.render$('/')
    expect($('#title').text()).toBe('Import Module Works')
    expect($('#items').text()).toBe('apple, banana, cherry')
    // CJS dependency that itself requires a JSON file
    expect($('#cjs-greeting').text()).toBe('hello from cjs')
    expect($('#version').text()).toBe('1.0.0')
    // ESM dependency imported from config-data.ts
    expect($('#esm-label').text()).toBe('hello from esm')
    // ESM .mjs module (config-data.mjs)
    expect($('#mjs-title').text()).toBe('ESM Config Works')
    expect($('#mjs-esm-label').text()).toBe('hello from esm')

    // resolveAlias: importModule with alias as request
    expect($('#alias-value').text()).toBe('resolved via alias')
    // resolveAlias: dependency of importModule target uses alias
    expect($('#alias-dep-label').text()).toBe('hello from esm')
    // loader rules: importModule on file requiring custom loader
    expect($('#custom-data-value').text()).toBe('hello from custom loader')
    // loader rules: dependency of importModule target needs custom loader
    expect($('#consumed-value').text()).toBe('hello from custom loader')

    if (isTurbopack) {
      // new URL('./image.png', import.meta.url) in url-wasm-data.ts
      expect($('#image-url').text()).toContain('image')
      expect($('#image-url').text()).toMatch(/\.png/)
      // WebAssembly add(1, 2) from add.wasm in url-wasm-data.ts
      expect($('#wasm-add-result').text()).toBe('3')
      // Dynamic import('./module.js') in url-wasm-data.ts
      expect($('#dynamic-value').text()).toBe('loaded dynamically')
      // new URL('./image.png', import.meta.url) in url-wasm-data.mjs
      expect($('#mjs-image-url').text()).toContain('image')
      expect($('#mjs-image-url').text()).toMatch(/\.png/)
      // WebAssembly add(10, 20) from add.wasm in url-wasm-data.mjs
      expect($('#mjs-wasm-add-result').text()).toBe('30')
      // Dynamic import('./module.js') in url-wasm-data.mjs
      expect($('#mjs-dynamic-value').text()).toBe('loaded dynamically')
    }
  })
})
