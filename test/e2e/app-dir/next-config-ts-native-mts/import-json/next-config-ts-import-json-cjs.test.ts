import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-json-cjs', () => {
  // TODO: Remove this once we bump minimum Node.js version to v22
  // TODO(as-any): pre-existing cast, not yet reviewed
  // eslint-disable-next-line @next/internal/no-as-any
  if (!(process.features as any).typescript) {
    it.skip('requires `process.features.typescript` to feature detect Node.js native TS', () => {})
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
