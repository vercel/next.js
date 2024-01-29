import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - imports',
  {
    files: __dirname,
  },
  ({ next }) => {
    ;['js', 'jsx', 'ts', 'tsx'].forEach((ext) => {
      it(`we can import all components from .${ext}`, async () => {
        const $ = await next.render$(`/${ext}`)
        expect($('#js').text()).toBe('CompJs')
      })
    })
  }
)
