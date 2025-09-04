import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('app-dir edge SSR invalid reexport', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: {
      'app/export': new FileRef(path.join(__dirname, 'app', 'export')),
      'app/export/inherit/page.tsx':
        "export { default, runtime, preferredRegion } from '../basic/page'",
    },
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should warn or error about the re-export of a pages runtime/preferredRegion config', async () => {
    try {
      await next.start()
    } catch (_) {
      // We expect the build to fail
    }

    if (isNextDev) {
      const browser = await next.browser('/export/inherit')
      // Turbopack is stricter and disallows reexports completely
      // webpack merely warns in the CLI and still serves the page wuthout a redbox
      if (process.env.IS_TURBOPACK_TEST) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Next.js can't recognize the exported \`preferredRegion\` field in route. It mustn't be reexported.",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/export/inherit/page.tsx (1:28)
         Next.js can't recognize the exported \`preferredRegion\` field in route. It mustn't be reexported.
         > 1 | export { default, runtime, preferredRegion } from '../basic/page'
             |                            ^^^^^^^^^^^^^^^",
           "stack": [],
         }
        `)
      }
    }

    expect(next.cliOutput).toInclude(
      `Next.js can't recognize the exported \`runtime\` field in`
    )
    expect(next.cliOutput).toInclude(
      `Next.js can't recognize the exported \`preferredRegion\` field in`
    )
  })
})
