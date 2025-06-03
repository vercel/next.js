import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app-root-param-getters - generateStaticParams', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'generate-static-params'),
  })

  it('should allow reading root params', async () => {
    const $ = await next.render$('/en/us')
    expect($('p').text()).toBe('hello world {"lang":"en","locale":"us"}')
  })

  it('should be a cache hit for fully prerendered pages', async () => {
    const response = await next.fetch('/en/us')
    expect(response.status).toBe(200)
    expect(
      response.headers.get(isNextDeploy ? 'x-vercel-cache' : 'x-nextjs-cache')
    ).toBe('HIT')
  })

  it("should be a cache miss for pages that aren't prerendered", async () => {
    const response = await next.fetch('/en/us/other/1')
    expect(response.status).toBe(200)
    if (isNextDeploy) {
      expect(response.headers.get('x-vercel-cache')).toBe('MISS')
    } else {
      expect(response.headers.get('x-nextjs-cache')).toBeFalsy()
    }
  })
})
