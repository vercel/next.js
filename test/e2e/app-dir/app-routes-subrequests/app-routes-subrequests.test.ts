import { createNextDescribe } from 'e2e-utils'

const bathPath = process.env.BASE_PATH ?? ''

createNextDescribe(
  'app-routes-subrequests',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('shortcuts after 5 subrequests', async () => {
      expect(JSON.parse(await next.render(bathPath + '/'))).toEqual({
        count: 5,
      })
    })
  }
)
