import { nextTestSetup } from 'e2e-utils'

describe('SSG Prerender No Revalidate', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function runTests(route: string) {
    it(`[${route}] should not revalidate when set to false`, async () => {
      const initialHtml = await next.render(route)

      let newHtml = await next.render(route)
      expect(initialHtml).toBe(newHtml)

      newHtml = await next.render(route)
      expect(initialHtml).toBe(newHtml)

      newHtml = await next.render(route)
      expect(initialHtml).toBe(newHtml)
    })

    it(`[${route}] should not revalidate /_next/data when set to false`, async () => {
      const dataRoute = `/_next/data/${next.buildId}${route === '/' ? '/index' : route}.json`

      const initialData = JSON.parse(await next.render(dataRoute))

      expect(JSON.parse(await next.render(dataRoute))).toEqual(initialData)
      expect(JSON.parse(await next.render(dataRoute))).toEqual(initialData)
      expect(JSON.parse(await next.render(dataRoute))).toEqual(initialData)
    })
  }

  runTests('/')
  runTests('/named')
  runTests('/nested')
  runTests('/nested/named')
})
