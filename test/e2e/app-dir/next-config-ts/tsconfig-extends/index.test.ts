import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-tsconfig-extends', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should resolve extends in tsconfig.json', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
