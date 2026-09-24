import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('app-dir edge SSR invalid reexport', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: {
      'app/layout.tsx': new FileRef(path.join(__dirname, 'app', 'layout.tsx')),
      'app/export': new FileRef(path.join(__dirname, 'app', 'export')),
      'app/export/inherit/page.tsx':
        "export { default, runtime, preferredRegion } from '../basic/page'",
      // Vercel rejects deployments with an unknown region, so the deployed
      // fixture uses a valid one.
      'app/export/basic/page.tsx':
        process.env.NEXT_TEST_MODE === 'deploy'
          ? `export default function Page() {
  if ('EdgeRuntime' in globalThis) {
    return <p>Edge!</p>
  }
  return <p>Node!</p>
}

export const runtime = 'edge'
export const preferredRegion = 'iad1'
`
          : new FileRef(
              path.join(__dirname, 'app', 'export', 'basic', 'page.tsx')
            ),
    },
    skipStart: true,
  })

  it('should warn or error about the re-export of a pages runtime/preferredRegion config', async () => {
    if (isNextDev || !isTurbopack) {
      await next.start()
    } else {
      await expect(next.start()).rejects.toThrow()
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
         Error: Next.js can't recognize the exported \`preferredRegion\` field in route. It mustn't be reexported.
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
  }, 240_000)
})
