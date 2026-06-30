import { nextTestSetup } from 'e2e-utils'

describe('empty-generate-static-params', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // TODO: The build error has no code frame because generateStaticParams runs
  // in the page-data worker, which lacks code-frame support. Surface one to
  // match prerender errors in a follow-up.
  function errorBlock(cliOutput: string) {
    return cliOutput.slice(
      cliOutput.indexOf('When using Cache Components'),
      cliOutput.indexOf('Build error occurred')
    )
  }

  if (isNextDev) {
    beforeAll(() => next.start())

    it('points the redbox at a literal empty array', async () => {
      const browser = await next.browser('/foo')
      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "When using Cache Components, all \`generateStaticParams\` functions must return at least one result. This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.

       Learn more: https://nextjs.org/docs/messages/empty-generate-static-params",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/[slug]/page.tsx (10:10) @ generateStaticParams
       > 10 |   return []
            |          ^",
         "stack": [
           "generateStaticParams app/[slug]/page.tsx (10:10)",
         ],
       }
      `)
    })

    it('points the redbox at the declaration for a computed empty array', async () => {
      const browser = await next.browser('/computed/foo')
      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "When using Cache Components, all \`generateStaticParams\` functions must return at least one result. This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.

       Learn more: https://nextjs.org/docs/messages/empty-generate-static-params",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/computed/[slug]/page.tsx (9:8) @ generateStaticParams
       >  9 | export async function generateStaticParams() {
            |        ^",
         "stack": [
           "generateStaticParams app/computed/[slug]/page.tsx (9:8)",
         ],
       }
      `)
    })
  } else {
    // Build one page at a time so each route's build error is isolated and can
    // be asserted individually.
    async function buildPage(page: string) {
      const { exitCode, cliOutput } = await next.build({
        args: ['--debug-prerender', '--debug-build-paths', page],
      })
      expect(exitCode).not.toBe(0)
      return errorBlock(cliOutput)
    }

    it('points the literal empty array build error at the array', async () => {
      const block = await buildPage('app/[slug]/page.tsx')
      if (isTurbopack) {
        expect(block).toMatchInlineSnapshot(`
         "When using Cache Components, all \`generateStaticParams\` functions must return at least one result. This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.

         Learn more: https://nextjs.org/docs/messages/empty-generate-static-params
             at generateStaticParams (app/[slug]/page.tsx:10:10)

         > "
        `)
      } else {
        expect(block).toMatchInlineSnapshot(`
         "When using Cache Components, all \`generateStaticParams\` functions must return at least one result. This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.

         Learn more: https://nextjs.org/docs/messages/empty-generate-static-params
             at generateStaticParams (webpack:///app/[slug]/page.tsx:10:10)

         > "
        `)
      }
    })

    it('points the computed empty array build error at the declaration', async () => {
      const block = await buildPage('app/computed/[slug]/page.tsx')
      if (isTurbopack) {
        expect(block).toMatchInlineSnapshot(`
         "When using Cache Components, all \`generateStaticParams\` functions must return at least one result. This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.

         Learn more: https://nextjs.org/docs/messages/empty-generate-static-params
             at generateStaticParams (app/computed/[slug]/page.tsx:9:8)

         > "
        `)
      } else {
        expect(block).toMatchInlineSnapshot(`
         "When using Cache Components, all \`generateStaticParams\` functions must return at least one result. This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.

         Learn more: https://nextjs.org/docs/messages/empty-generate-static-params
             at generateStaticParams (webpack:///app/computed/[slug]/page.tsx:9:8)

         > "
        `)
      }
    })
  }
})
