import { createNextDescribe } from 'e2e-utils'

const bathPath = process.env.BASE_PATH ?? ''

createNextDescribe(
  'app-simple-routes',
  {
    files: __dirname,
  },
  ({ next }) => {
    describe('works with simple routes', () => {
      it('renders a node route', async () => {
        expect(
          JSON.parse(await next.render(bathPath + '/api/node.json'))
        ).toEqual({
          pathname: '/api/node.json',
        })
      })
      it('renders a edge route', async () => {
        expect(
          JSON.parse(await next.render(bathPath + '/api/edge.json'))
        ).toEqual({
          pathname: '/api/edge.json',
        })
      })
    })
  }
)
