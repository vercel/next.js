import { nextTestSetup } from 'e2e-utils'

describe('import-type-text', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('support import type: text', async () => {
    const response = JSON.parse(await next.render('/api'))
    expect(response).toEqual({
      typeofString: true,
      length: 12,
      content: 'hello world\n',
    })
  })
})
