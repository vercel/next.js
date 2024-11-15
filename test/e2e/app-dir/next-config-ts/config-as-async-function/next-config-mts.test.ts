import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - config as async function (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.renameFile('next.config.ts', 'next.config.mts')
    await next.start()
  })

  it('should support config as async function (next.config.mts)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
