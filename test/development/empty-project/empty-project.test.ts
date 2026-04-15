import { nextTestSetup } from 'e2e-utils'

describe('Empty Project', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.deleteFile('pages/.gitkeep')
    await next.start()
  })

  it('Should not time out and return 404', async () => {
    const res = await next.fetch('/', { timeout: 10_000 })
    expect(res.status).toBe(404)
  })
})
