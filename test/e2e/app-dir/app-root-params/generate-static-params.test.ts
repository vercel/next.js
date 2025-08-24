import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app-root-params - generateStaticParams', () => {
  const { next, isNextDeploy, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'generate-static-params'),
  })

  it('should return rootParams', async () => {
    const $ = await next.render$('/en/us')
    expect($('p').text()).toBe('hello world {"lang":"en","locale":"us"}')
  })

  it('should only return rootParams and not other params', async () => {
    const $ = await next.render$('/en/us/other/1')
    expect($('#dynamic-params').text()).toBe('1')
    expect($('#root-params').text()).toBe('{"lang":"en","locale":"us"}')
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

  // `next-types-plugin` currently only runs in Webpack.
  // We skip deployment mode since we don't care about the deploy, we just want to
  // check the file generated at build time.
  if (!isNextDeploy && !isTurbopack) {
    it('should correctly generate types', async () => {
      expect(await next.hasFile('.next/types/server.d.ts')).toBe(true)
      const fileContents = await next.readFile('.next/types/server.d.ts')
      expect(fileContents).toContain(
        `export function unstable_rootParams(): Promise<{ lang: string, locale: string }>`
      )
    })
  }
})
