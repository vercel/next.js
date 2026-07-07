import { nextTestSetup } from 'e2e-utils'

const fileNames = ['1', '2.ext', '3.html']

describe('GS(S)P with file extension', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    it('should support slug with different extensions', async () => {
      for (const name of fileNames) {
        expect(await next.hasFile(`.next/server/pages/${name}.html`)).toBe(true)
        expect(await next.hasFile(`.next/server/pages/${name}.json`)).toBe(true)
      }
    })

    it('should render properly for routes with extension', async () => {
      const paths = fileNames.map((name) => `/${name}`)
      const contentPromises = paths.map((path) => next.render(path))
      const contents = await Promise.all(contentPromises)
      contents.forEach((content, i) => expect(content).toContain(fileNames[i]))
    })

    it('should contain extension in name of json files in _next/data', async () => {
      const buildId = (await next.readFile('.next/BUILD_ID')).trim()
      const requests = fileNames.map((name) => {
        const pathname = `/_next/data/${buildId}/${name}.json`
        return next.fetch(pathname).then((r) => r.json())
      })
      const results = await Promise.all(requests)
      results.forEach((result, i) =>
        expect(result.pageProps.value).toBe(fileNames[i])
      )
    })
  })
})
