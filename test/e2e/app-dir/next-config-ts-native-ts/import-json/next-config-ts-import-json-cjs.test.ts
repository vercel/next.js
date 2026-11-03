import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-json-cjs', () => {
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
  })

  it('should support import json (CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
