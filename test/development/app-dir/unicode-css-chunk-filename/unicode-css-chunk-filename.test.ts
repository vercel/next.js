import { nextTestSetup } from 'e2e-utils'

describe('unicode-css-chunk-filename', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('renders CSS modules whose generated names cross a UTF-8 boundary', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Unicode path reproduction')
  })
})
