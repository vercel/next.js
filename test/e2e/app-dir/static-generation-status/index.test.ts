import { nextTestSetup } from 'e2e-utils'

describe('app-dir static-generation-status', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page using notFound with status 404', async () => {
    const { status } = await next.fetch('/not-found-page')
    expect(status).toBe(404)
  })

  it('should render the page using redirect with status 307', async () => {
    const { status } = await next.fetch('/redirect-page', {
      redirect: 'manual',
    })
    expect(status).toBe(307)
  })

  it('should render the non existed route redirect with status 404', async () => {
    expect((await next.fetch('/does-not-exist')).status).toBe(404)
  })
})
