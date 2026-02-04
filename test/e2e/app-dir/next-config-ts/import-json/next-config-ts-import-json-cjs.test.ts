import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-json-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support import json (CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
