import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Revalidate asPath Normalizing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const checkAsPath = async (urlPath: string, expectedAsPath: string) => {
    const $ = await next.render$(urlPath)
    const asPath = $('#as-path').text()
    expect(asPath).toBe(expectedAsPath)
  }

  it('should render with correct asPath with /_next/data /index requested', async () => {
    const outputIndex = next.cliOutput.length
    const path = `/_next/data/${next.buildId}/index.json`

    await retry(async () => {
      const data = await next.render(path)
      expect(JSON.parse(data).pageProps).toEqual({
        hello: 'world',
      })
      const newOutput = next.cliOutput.slice(outputIndex)
      expect(newOutput).toContain('asPath')
    })
    const newOutput = next.cliOutput.slice(outputIndex)
    const asPath = newOutput.split('asPath: ').pop()!.split('\n').shift()
    expect(asPath).toBe('/')
  })

  it('should render with correct asPath with / requested', async () => {
    await checkAsPath('/', '/')
  })

  it('should render with correct asPath with /another/index requested', async () => {
    await checkAsPath('/another/index', '/another/index')
  })

  it('should render with correct asPath with /_next/data /another/index requested', async () => {
    const outputIndex = next.cliOutput.length
    const path = `/_next/data/${next.buildId}/another/index.json`

    await retry(async () => {
      const data = await next.render(path)
      expect(JSON.parse(data).pageProps).toEqual({
        hello: 'world',
      })
      const newOutput = next.cliOutput.slice(outputIndex)
      expect(newOutput).toContain('asPath')
    })
    const newOutput = next.cliOutput.slice(outputIndex)
    const asPath = newOutput.split('asPath: ').pop()!.split('\n').shift()
    expect(asPath).toBe('/another/index')
  })
})
