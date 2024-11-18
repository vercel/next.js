import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import json (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.renameFile('next.config.ts', 'next.config.mts')
    await next.start()
  })

  it('should support import json (next.config.mts)', async () => {
    const $ = await next.render$('/')
    const text = $('p').text()
    expect(text).toContain('foo')
  })
})
