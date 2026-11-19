import { nextTestSetup } from 'e2e-utils'

describe('fallback-shell-missing-cache', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('regenerates a missing fallback shell without bailing out when layout accesses params with generateStaticParams', async () => {
      const resA = await next.fetch('/items/a')
      expect(resA.status).toBe(200)
      const textA = await resA.text()
      expect(textA).toContain('Item a')

      const resB = await next.fetch('/items/b')
      expect(resB.status).toBe(200)
      const textB = await resB.text()
      expect(textB).toContain('Item b')
    })
  } else {
    it('skipped in dev', () => {})
  }
})
