import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-import-module', () => {
  const { next, skipped } = nextTestSetup({
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
    // new URL() usage in config-data.ts
    expect($('#url-pathname').text()).toBe('/test-path')
    // WebAssembly availability in config-data.ts
    expect($('#wasm-available').text()).toBe('true')
    // ESM .mjs module (config-data.mjs) that imports esm-dep.mjs
    expect($('#mjs-title').text()).toBe('ESM Config Works')
    expect($('#mjs-esm-label').text()).toBe('hello from esm')
    // new URL() usage in config-data.mjs
    expect($('#mjs-url-pathname').text()).toBe('/mjs-path')
    // WebAssembly availability in config-data.mjs
    expect($('#mjs-wasm-available').text()).toBe('true')
  })
})
