import path from 'path'
import { outdent } from 'outdent'
import { FileRef, createNextDescribe } from 'e2e-utils'
import {
  check,
  getRedboxDescription,
  getRedboxSource,
  getVersionCheckerText,
  hasRedbox,
  retry,
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
        async () => ((await hasRedbox(browser)) ? 'success' : 'fail'),
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
        async () => ((await hasRedbox(browser)) ? 'success' : 'fail'),
        /success/
      )
      const errorDescription = await getRedboxDescription(browser)

      expect(errorDescription).toContain(
        `Error: Invariant: \`cookies\` expects to have requestAsyncStorage, none available.`
      )
    })

    it('should show source code for jsx errors from server component', async () => {
      await next.patchFile(
        'app/server/page.js',
        outdent`
        export default function Page() {
          return <div>{alert('warn')}</div>
        }
      `
      )

      const browser = await next.browser('/server')
      await check(
        async () => ((await hasRedbox(browser)) ? 'success' : 'fail'),
        /success/
      )

      const errorDescription = await getRedboxDescription(browser)

      expect(errorDescription).toContain(`Error: alert is not defined`)
    })

    it('should show the userland code error trace when fetch failed error occurred', async () => {
      await next.patchFile(
        'app/server/page.js',
        outdent`
        export default async function Page() {
          await fetch('http://locahost:3000/xxxx')
          return 'page'
        }
        `
      )
      const browser = await next.browser('/server')
      await check(
        async () => ((await hasRedbox(browser)) ? 'success' : 'fail'),
        /success/
      )

      const source = await getRedboxSource(browser)
      // Can show the original source code
      expect(source).toContain('app/server/page.js')
      expect(source).toContain(`await fetch('http://locahost:3000/xxxx')`)
    })

    it('should contain nextjs version check in error overlay', async () => {
      await next.patchFile(
        'app/server/page.js',
        outdent`
        export default function Page() {
          throw new Error('test')
        }
        `
      )
      const browser = await next.browser('/server')

      await retry(async () => {
        expect(await hasRedbox(browser)).toBe(true)
      })
      await expect(await getVersionCheckerText(browser)).toContain(
        `Next.js is up to date${process.env.TURBOPACK ? ' (turbo)' : ''}`
      )
    })
  }
)
