import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import-json (project CJS)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support import json (project CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
