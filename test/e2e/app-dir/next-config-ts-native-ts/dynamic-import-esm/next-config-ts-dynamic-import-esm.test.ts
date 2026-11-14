import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-dynamic-import-esm', () => {
  // TODO: Remove this once we bump minimum Node.js version to v22
  if (
    !(process.features as any).typescript ||
    process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED !== 'true'
  ) {
    it.skip('requires the Node.js native TS loader', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should support dynamic import (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
