import path from 'path'
import { outdent } from 'outdent'
import { FileRef, createNextDescribe } from 'e2e-utils'
import {
  check,
  getRedboxDescription,
  hasRedbox,
  shouldRunTurboDevTest,
} from 'next-test-utils'

createNextDescribe(
  'Error overlay - RSC runtime errors',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'rsc-runtime-errors')),
    packageJson: {
      scripts: {
        setup: 'cp -r ./node_modules_bak/* ./node_modules',
        build: 'yarn setup && next build',
        dev: `yarn setup && next ${
          shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'
        }`,
        start: 'next start',
      },
    },
    installCommand: 'yarn',
    startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
  },
  ({ next }) => {
    it('should show runtime errors if invalid client API from node_modules is executed', async () => {
      await next.patchFile(
        'app/server/page.js',
        outdent`
      import { callClientApi } from 'client-package'
      export default function Page() {
        callClientApi()
        return 'page'
      }
    `
      )

      const browser = await next.browser('/server')

      await check(
        async () => ((await hasRedbox(browser, true)) ? 'success' : 'fail'),
        /success/
      )
      const errorDescription = await getRedboxDescription(browser)

      expect(errorDescription).toContain(
        `Error: useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
      )
    })

    it('should show runtime errors if invalid server API from node_modules is executed', async () => {
      await next.patchFile(
        'app/client/page.js',
        outdent`
      'use client'
      import { callServerApi } from 'server-package'
      export default function Page() {
        callServerApi()
        return 'page'
      }
    `
      )

      const browser = await next.browser('/client')

      await check(
        async () => ((await hasRedbox(browser, true)) ? 'success' : 'fail'),
        /success/
      )
      const errorDescription = await getRedboxDescription(browser)

      expect(errorDescription).toContain(
        `Error: Invariant: cookies() expects to have requestAsyncStorage, none available.`
      )
    })
  }
)
