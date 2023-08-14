import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'children-page',
  {
    files: __dirname,
  },
  ({ next }) => {
    describe('with app dir', () => {
      it('should let you have a page named children', async () => {
        const $ = await next.render$('/children')
        expect($('#children-page').text()).toBe('children - app')
      })
    })

    describe('with pages dir', () => {
      it('should let you have a page named children', async () => {
        const $ = await next.render$('/other/children')
        expect($('#children-page').text()).toBe('children - pages')
      })
    })
  }
)
