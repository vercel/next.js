import { nextTestSetup } from 'e2e-utils'

describe('app dir - imports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  ;['js', 'jsx', 'ts', 'tsx'].forEach((ext) => {
    it(`we can import all components from .${ext}`, async () => {
      const $ = await next.render$(`/${ext}`)
      expect($('#js').text()).toBe('CompJs')
    })
  })
})
