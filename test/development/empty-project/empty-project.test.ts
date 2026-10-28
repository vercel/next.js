import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Empty Project', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.deleteFile('pages/.gitkeep')
    // Keep both routing roots present before starting the watcher, but no
    // ordinary routes. A layout alone must not create a public destination.
    await next.patchFile(
      'app/layout.js',
      'export default function Layout({ children }) { return <html><body>{children}</body></html> }'
    )
    await next.start()
  })

  it('Should not time out and return 404', async () => {
    const res = await next.fetch('/', { signal: AbortSignal.timeout(30_000) })
    expect(res.status).toBe(404)
  })

  for (const { file, renamed, url, renamedUrl, marker, code } of [
    {
      file: 'pages/live-page.js',
      renamed: 'pages/renamed-page.jsx',
      url: '/live-page',
      renamedUrl: '/renamed-page',
      marker: 'live Pages page',
      code: 'export default function Page() { return <p>live Pages page</p> }',
    },
    {
      file: 'pages/api/live-api.js',
      renamed: 'pages/api/renamed-api.js',
      url: '/api/live-api',
      renamedUrl: '/api/renamed-api',
      marker: 'live Pages API',
      code: 'export default function handler(req, res) { res.json({ marker: "live Pages API" }) }',
    },
    {
      file: 'app/(group)/live-app/page.js',
      renamed: 'app/(group)/renamed-app/page.js',
      url: '/live-app',
      renamedUrl: '/renamed-app',
      marker: 'live App page',
      code: 'export default function Page() { return <p>live App page</p> }',
    },
    {
      file: 'app/live-handler/route.js',
      renamed: 'app/renamed-handler/route.js',
      url: '/live-handler',
      renamedUrl: '/renamed-handler',
      marker: 'live App handler',
      code: 'export function GET() { return Response.json({ marker: "live App handler" }) }',
    },
  ]) {
    it(`discovers, repairs, renames and removes ${file} without restarting`, async () => {
      async function expectDestination(pathname: string) {
        await retry(async () => {
          const response = await next.fetch(pathname)
          expect(response.status).toBe(200)
          expect(await response.text()).toContain(marker)
        })
      }
      const extensionFile = file.replace(/\.js$/, '.jsx')
      try {
        expect((await next.fetch(url)).status).toBe(404)
        await next.patchFile(file, code)
        await expectDestination(url)

        await next.patchFile(file, 'export const broken = ;')
        await retry(async () => {
          // A discovered route with a compiler error is still a matched route.
          expect((await next.fetch(url)).status).toBe(500)
        }, 30000)
        await next.patchFile(file, code)
        await expectDestination(url)

        // Pages/App pages support JSX extensions. Route Handler conventions
        // use route.js/route.ts, so keep this probe to the page cases.
        if (!file.startsWith('pages/api/') && !file.endsWith('/route.js')) {
          await next.renameFile(file, extensionFile)
          await expectDestination(url)
          await next.renameFile(extensionFile, file)
          await expectDestination(url)
        }

        if (file.startsWith('app/')) {
          await next.renameFolder(
            file.slice(0, file.lastIndexOf('/')),
            renamed.slice(0, renamed.lastIndexOf('/'))
          )
        } else {
          await next.renameFile(file, renamed)
        }
        await retry(async () => {
          expect((await next.fetch(url)).status).toBe(404)
        })
        await expectDestination(renamedUrl)
        await next.deleteFile(renamed)
        await retry(async () => {
          expect((await next.fetch(renamedUrl)).status).toBe(404)
        })
      } finally {
        for (const pathname of [file, extensionFile, renamed]) {
          if (await next.hasFile(pathname)) await next.deleteFile(pathname)
        }
      }
    })
  }

  it('refreshes page/data matching and the browser inventory when higher-priority routes change', async () => {
    const files = [
      'pages/priority/[...slug].js',
      'pages/priority/[id].js',
      'pages/priority/fixed.js',
    ]
    const code = (
      marker: string
    ) => `export default function Page() { return <p>${marker}</p> }
      export function getServerSideProps() { return { props: { marker: ${JSON.stringify(marker)} } } }`
    async function expectRoute(marker: string, inventory: string[]) {
      await retry(async () => {
        const page = await next.fetch('/priority/fixed')
        expect(page.status).toBe(200)
        expect(await page.text()).toContain(marker)
        const data = await next.fetch(
          '/_next/data/development/priority/fixed.json'
        )
        expect(data.status).toBe(200)
        expect(await data.json()).toMatchObject({ pageProps: { marker } })
        const manifest = await next.fetch(
          '/_next/static/development/_devPagesManifest.json'
        )
        expect(manifest.status).toBe(200)
        expect(
          (await manifest.json()).pages.filter((page: string) =>
            page.startsWith('/priority/')
          )
        ).toEqual(inventory)
      })
    }
    try {
      await next.patchFile(files[0], code('catch-all destination'))
      await expectRoute('catch-all destination', ['/priority/[...slug]'])
      await next.patchFile(files[1], code('dynamic destination'))
      await expectRoute('dynamic destination', [
        '/priority/[id]',
        '/priority/[...slug]',
      ])
      await next.patchFile(files[2], code('static destination'))
      await expectRoute('static destination', [
        '/priority/fixed',
        '/priority/[id]',
        '/priority/[...slug]',
      ])
      const browser = await next.browser('/priority/fixed')
      try {
        expect(await browser.elementByCss('p').text()).toBe(
          'static destination'
        )
      } finally {
        await browser.close()
      }
      await next.deleteFile(files[2])
      await expectRoute('dynamic destination', [
        '/priority/[id]',
        '/priority/[...slug]',
      ])
      await next.deleteFile(files[1])
      await expectRoute('catch-all destination', ['/priority/[...slug]'])
      await next.deleteFile(files[0])
      await retry(async () => {
        expect((await next.fetch('/priority/fixed')).status).toBe(404)
        expect(
          (await next.fetch('/_next/data/development/priority/fixed.json'))
            .status
        ).toBe(404)
      })
    } finally {
      for (const file of files)
        if (await next.hasFile(file)) await next.deleteFile(file)
    }
  })
})
