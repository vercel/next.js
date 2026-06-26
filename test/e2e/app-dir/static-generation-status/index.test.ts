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

  it('should render the client page using redirect with status 307', async () => {
    const { status } = await next.fetch('/redirect-client-page', {
      redirect: 'manual',
    })
    expect(status).toBe(307)
  })

  it('should respond with 308 status code if permanent flag is set', async () => {
    const { status } = await next.fetch('/redirect-permanent', {
      redirect: 'manual',
    })
    expect(status).toBe(308)
  })

  it('should render the non existed route redirect with status 404', async () => {
    expect((await next.fetch('/does-not-exist')).status).toBe(404)
  })
})
