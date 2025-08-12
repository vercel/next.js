import { nextTestSetup } from 'e2e-utils'

describe('00-app-dir-static', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should render dashboard page correctly', async () => {
    const res = await next.fetch('/dashboard')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('hello from app/dashboard')

    if (isNextDeploy) {
      expect(res.headers.get('vary')).toContain(
        'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch'
      )
    }
  })

  it('should handle RSC requests correctly', async () => {
    const res = await next.fetch('/dashboard', {
      headers: { rsc: '1' },
    })
    expect(res.status).toBe(200)

    const text = await res.text()
    expect(text).toContain(':{')
    expect(text).not.toContain('<html')

    if (isNextDeploy) {
      expect(res.headers.get('content-type')).toBe('text/x-component')
      expect(res.headers.get('vary')).toContain(
        'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch'
      )
    }
  })

  it('should render dashboard/another page correctly', async () => {
    const res = await next.fetch('/dashboard/another')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('hello from newroot/dashboard/another')
  })

  it('should render dynamic route correctly', async () => {
    const res = await next.fetch('/dashboard/deployments/123')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain(
      'hello from app/dashboard/deployments/[id]. ID is: <!-- -->123'
    )
  })

  it('should render index page correctly', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('index app page')
  })

  it('should handle dynamic nested routes', async () => {
    const res = await next.fetch('/dynamic/category-1/id-1')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('{"category":"category-1","id":"id-1"}')
  })

  it('should render changelog page correctly', async () => {
    const res = await next.fetch('/dashboard/changelog')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('hello from app/dashboard/changelog')
  })

  it('should handle RSC requests for index page', async () => {
    const res = await next.fetch('/', {
      headers: { rsc: '1' },
    })
    expect(res.status).toBe(200)

    const text = await res.text()
    expect(text).toContain(':{')
    expect(text).not.toContain('<html')
  })
})
