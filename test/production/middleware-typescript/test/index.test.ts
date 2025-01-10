/* eslint-env jest */
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('middleware-typescript', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '../app'),
  })

  it('should have built and started', async () => {
    const response = await next.fetch('/static')
    expect(response.headers.get('data')).toEqual('hello from middleware')
  })
})
