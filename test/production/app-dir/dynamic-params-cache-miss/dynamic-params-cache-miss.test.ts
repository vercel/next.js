import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('dynamicParams: false with an empty cache', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('renders a build-generated path on every cache miss', async () => {
    const outputStart = next.cliOutput.length
    for (let i = 0; i < 2; i++) {
      const response = await next.fetch('/closed/known')
      expect(response.status).toBe(200)
      expect(load(await response.text())('#slug').text()).toBe('known')
    }
    expect(next.cliOutput.slice(outputStart)).toContain(
      'cache lookup /closed/known'
    )
  })

  it.each(['document', 'navigation', 'bot'])(
    'rejects an unlisted %s request before a cache lookup or render',
    async (kind) => {
      const headers: Record<string, string> = {}
      if (kind === 'navigation') headers.RSC = '1'
      if (kind === 'bot') headers['user-agent'] = 'Googlebot'
      const outputStart = next.cliOutput.length
      const response = await next.fetch('/closed/unlisted', { headers })
      expect(response.status).toBe(404)
      await response.text()
      const output = next.cliOutput.slice(outputStart)
      expect(output).not.toContain('cache lookup /closed/unlisted')
      expect(output).not.toContain('closed page render unlisted')
      expect(output).not.toContain('NoFallbackError')
    }
  )
})
