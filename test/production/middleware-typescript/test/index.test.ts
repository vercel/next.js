/* eslint-env jest */
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('middleware-typescript', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '../app'),
    dependencies: {
      // TODO: fix the TS error with the TS 5.6
      // x-ref: https://github.com/vercel/next.js/actions/runs/10777104696/job/29887663970?pr=69784
      typescript: '5.5.4',
    },
  })

  it('should have built and started', async () => {
    const response = await next.fetch('/static')
    expect(response.headers.get('data')).toEqual('hello from middleware')
  })
})
