import { nextTestSetup } from 'e2e-utils'

describe('ppr-root-param-rsc-fallback', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  it('does not return HTML for a pregenerated root param full-route rsc request', async () => {
    const response = await next.fetch(`/tenant-a/samples`, {
      headers: {
        RSC: '1',
      },
    })
    const body = await response.text()
    const contentType = response.headers.get('content-type') ?? ''

    expect(response.status).toBe(200)
    expect(contentType).toContain('text/x-component')
    expect(body).not.toContain('<!DOCTYPE html>')
  })

  it('does not return HTML for a non-pregenerated root param full-route rsc request', async () => {
    const tenant = `tenant-${Date.now()}`
    const response = await next.fetch(`/${tenant}/samples`, {
      headers: {
        RSC: '1',
      },
    })
    const body = await response.text()
    const contentType = response.headers.get('content-type') ?? ''

    expect(response.status).toBe(200)
    expect(contentType).toContain('text/x-component')
    expect(body).not.toContain('<!DOCTYPE html>')
  })
})
