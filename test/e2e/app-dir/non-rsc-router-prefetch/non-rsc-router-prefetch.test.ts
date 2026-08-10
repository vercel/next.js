import { nextTestSetup } from 'e2e-utils'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  RSC_HEADER,
} from 'next/dist/client/components/app-router-headers'

describe('non-rsc-router-prefetch', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    const res = await next.fetch('/')
    await res.text()
  })

  it('ignores the router prefetch header for HTML requests', async () => {
    const res = await next.fetch('/', {
      headers: {
        [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      },
      signal: AbortSignal.timeout(5_000),
    })
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('hello world')
  })

  it('honors the router prefetch header for RSC requests', async () => {
    const res = await next.fetch('/', {
      headers: {
        [RSC_HEADER]: '1',
        [NEXT_ROUTER_PREFETCH_HEADER]: '1',
      },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/x-component')
  })
})
