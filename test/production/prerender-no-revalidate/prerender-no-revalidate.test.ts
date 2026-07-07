import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('SSG Prerender No Revalidate', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function runTests(route: string) {
    const pagePath = route === '/' ? '/index' : route

    it(`[${route}] should not revalidate when set to false`, async () => {
      const fileName = `.next/server/pages${pagePath}.html`
      const initialHtml = await next.render(route)
      const initialFileHtml = await next.readFile(fileName)

      let newHtml = await next.render(route)
      expect(initialHtml).toBe(newHtml)
      expect(await next.readFile(fileName)).toBe(initialFileHtml)

      await waitFor(500)

      newHtml = await next.render(route)
      expect(initialHtml).toBe(newHtml)
      expect(await next.readFile(fileName)).toBe(initialFileHtml)

      await waitFor(500)

      newHtml = await next.render(route)
      expect(initialHtml).toBe(newHtml)
      expect(await next.readFile(fileName)).toBe(initialFileHtml)

      expect(next.cliOutput).not.toContain('GSP was re-run')
    })

    it(`[${route}] should not revalidate /_next/data when set to false`, async () => {
      const fileName = `.next/server/pages${pagePath}.html`
      const dataRoute = `/_next/data/${next.buildId}${pagePath}.json`

      const initialData = JSON.parse(await next.render(dataRoute))
      const initialFileJson = await next.readFile(fileName)

      expect(JSON.parse(await next.render(dataRoute))).toEqual(initialData)
      expect(await next.readFile(fileName)).toBe(initialFileJson)
      await waitFor(500)

      expect(JSON.parse(await next.render(dataRoute))).toEqual(initialData)
      expect(await next.readFile(fileName)).toBe(initialFileJson)
      await waitFor(500)

      expect(JSON.parse(await next.render(dataRoute))).toEqual(initialData)
      expect(await next.readFile(fileName)).toBe(initialFileJson)

      expect(next.cliOutput).not.toContain('GSP was re-run')
    })
  }

  runTests('/')
  runTests('/named')
  runTests('/nested')
  runTests('/nested/named')
})
