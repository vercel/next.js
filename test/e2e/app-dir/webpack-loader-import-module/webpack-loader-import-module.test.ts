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
    // ESM dependency
    expect($('#esm-label').text()).toBe('hello from esm')
  })
})
