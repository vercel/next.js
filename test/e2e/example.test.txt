import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('should set-up next', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: { 'pages/index.js': 'export default () => "hello" ' },
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    console.log(next.url, next.appPort)
  })
})
