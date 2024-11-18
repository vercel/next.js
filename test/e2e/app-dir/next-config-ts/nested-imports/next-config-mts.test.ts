import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - nested imports (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.renameFile('next.config.ts', 'next.config.mts')
    await next.start()
  })

  it('should support nested imports (next.config.mts)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobarbaz')
  })
})
