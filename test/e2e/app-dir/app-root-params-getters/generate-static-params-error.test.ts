import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('app-root-param-getters - generateStaticParams error', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'generate-static-params-error'),
    skipStart: true,
    skipDeployment: true,
  })

  beforeAll(async () => {
    try {
      await next.start()
    } catch {}
  })

  if (isNextDev) {
    it('should error when reading a root param inside the generateStaticParams that defines it - dev', async () => {
      const browser = await next.browser('/en/us')

      // TODO: This is not the correct error code.
      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "Route /[lang]/[locale] used \`import('next/root-params').lang()\` inside \`generateStaticParams\`, but the \`lang\` parameter was not provided by a parent \`generateStaticParams\`. In \`generateStaticParams\`, root params are only available for segments nested below the segment that provides them.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/[lang]/[locale]/layout.tsx (16:23) @ generateStaticParams
       > 16 |   const l = await lang()
            |                       ^",
         "stack": [
           "generateStaticParams app/[lang]/[locale]/layout.tsx (16:23)",
         ],
       }
      `)
    })
  } else {
    it('should error when reading a root param inside the generateStaticParams that defines it - build', async () => {
      expect(next.cliOutput).toContain(
        "Route /[lang]/[locale] used `import('next/root-params').lang()` inside `generateStaticParams`, but the `lang` parameter was not provided by a parent `generateStaticParams`. In `generateStaticParams`, root params are only available for segments nested below the segment that provides them."
      )
    })
  }
})
