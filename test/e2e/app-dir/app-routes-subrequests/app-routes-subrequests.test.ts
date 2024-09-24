import { nextTestSetup } from 'e2e-utils'

const bathPath = process.env.BASE_PATH ?? ''

describe('app-routes-subrequests', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('shortcuts after 5 subrequests', async () => {
    expect(JSON.parse(await next.render(bathPath + '/'))).toEqual({
      count: 5,
    })
  })
})
