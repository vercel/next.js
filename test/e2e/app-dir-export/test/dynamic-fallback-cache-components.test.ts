import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry, startStaticServer, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import fs from 'fs-extra'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..'),
  skipDeployment: true,
  skipStart: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - with output export - cacheComponents fallback dynamic params', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - with output export - cacheComponents fallback dynamic params',
    () => {
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined

      beforeAll(async () => {
        await next.patchFile('next.config.js', (content) =>
          content.replace(
            'trailingSlash: true,',
            `trailingSlash: true,
  cacheComponents: true,`
          )
        )

        await next.patchFile(
          'app/another/[slug]/slug-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function SlugClient() {
  const params = useParams()

  return <h1>{params.slug}</h1>
}
`
        )

        await next.patchFile(
          'app/another/[slug]/page.js',
          () => `import Link from 'next/link'
import { Suspense } from 'react'
import SlugClient from './slug-client'

export default function Page(props) {
  return (
    <main>
      <Suspense fallback={<h1>Loading slug...</h1>}>
        <SlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/another">Visit another page</Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/docs/page.js',
          `import Link from 'next/link'

export default function DocsIndex() {
  return (
    <main>
      <h1>Docs</h1>
      <ul>
        <li>
          <Link href="/docs/guides/export/fallback">
            docs export fallback page
          </Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/docs/[...slug]/slug-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function DocsSlugClient() {
  const params = useParams()

  return <h1>{Array.isArray(params.slug) ? params.slug.join('/') : 'missing'}</h1>
}
`
        )

        await next.patchFile(
          'app/docs/[...slug]/page.js',
          `import Link from 'next/link'
import { Suspense } from 'react'
import DocsSlugClient from './slug-client'

export default function DocsCatchAllPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading docs...</h1>}>
        <DocsSlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/docs">Visit docs index</Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/optional/[[...slug]]/slug-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function OptionalSlugClient() {
  const params = useParams()
  const slug = params.slug

  return <h1>{Array.isArray(slug) ? slug.join('/') : 'optional index'}</h1>
}
`
        )

        await next.patchFile(
          'app/optional/[[...slug]]/page.js',
          `import Link from 'next/link'
import { Suspense } from 'react'
import OptionalSlugClient from './slug-client'

export default function OptionalCatchAllPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading optional...</h1>}>
        <OptionalSlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/optional/deep/path">Visit optional deep path</Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/(grouped)/grouped/page.js',
          `import Link from 'next/link'

export default function GroupedIndexPage() {
  return (
    <main>
      <h1>Grouped index</h1>
      <ul>
        <li>
          <Link href="/grouped/from-group">Visit grouped fallback page</Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/(grouped)/grouped/[slug]/slug-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function GroupedSlugClient() {
  const params = useParams()

  return <h1>{params.slug}</h1>
}
`
        )

        await next.patchFile(
          'app/(grouped)/grouped/[slug]/page.js',
          `import Link from 'next/link'
import { Suspense } from 'react'
import GroupedSlugClient from './slug-client'

export default function GroupedSlugPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading grouped slug...</h1>}>
        <GroupedSlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/grouped">Visit grouped index</Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/inbox/layout.js',
          `export default function InboxLayout({ children, modal }) {
  return (
    <main>
      {children}
      <section id="modal-slot">{modal}</section>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/inbox/page.js',
          `import Link from 'next/link'

export default function InboxIndexPage() {
  return (
    <main>
      <h1>Inbox</h1>
      <ul>
        <li>
          <Link href="/inbox/thread-123">Visit inbox thread</Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/inbox/[thread]/thread-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function InboxThreadClient() {
  const params = useParams()

  return <h1>{params.thread}</h1>
}
`
        )

        await next.patchFile(
          'app/inbox/[thread]/page.js',
          `import Link from 'next/link'
import { Suspense } from 'react'
import InboxThreadClient from './thread-client'

export default function InboxThreadPage() {
  return (
    <>
      <Suspense fallback={<h1>Loading inbox thread...</h1>}>
        <InboxThreadClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/inbox">Visit inbox index</Link>
        </li>
      </ul>
    </>
  )
}
`
        )

        await next.patchFile(
          'app/inbox/@modal/default.js',
          `export default function InboxModalDefault() {
  return <p id="modal-thread">No modal</p>
}
`
        )

        await next.patchFile(
          'app/inbox/@modal/[thread]/modal-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function InboxModalClient() {
  const params = useParams()

  return <p id="modal-thread">Modal {params.thread}</p>
}
`
        )

        await next.patchFile(
          'app/inbox/@modal/[thread]/page.js',
          `import { Suspense } from 'react'
import InboxModalClient from './modal-client'

export default function InboxModalPage() {
  return (
    <Suspense fallback={<p id="modal-thread">Loading modal...</p>}>
      <InboxModalClient />
    </Suspense>
  )
}
`
        )

        await next.deleteFile('app/api/json/route.js')
        await next.deleteFile('app/api/txt/route.js')

        await next.patchFile('app/another/page.js', (content) =>
          content.replace(
            `        <li>
          <Link href="/image-import">image import page</Link>
        </li>`,
            `        <li>
          <Link href="/another/third">another third page</Link>
        </li>
        <li>
          <Link href="/image-import">image import page</Link>
        </li>`
          )
        )

        await next.build()

        port = await findPort()
        const app = await startStaticServer(
          join(next.testDir, 'out'),
          join(next.testDir, 'out', '_fallback.html'),
          port
        )
        stopOrKill = () => stopApp(app)
      })

      afterAll(async () => {
        if (stopOrKill) {
          await stopOrKill()
        }
        await next.destroy()
      })

      it('writes fallback artifacts instead of per-param prerenders', async () => {
        const outDir = join(next.testDir, 'out')

        expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
        expect(
          await fs.readFile(join(outDir, '_fallback.html'), 'utf8')
        ).toContain('__NEXT_EXPORT_FALLBACK=1')
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.html')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'docs', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'optional', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'grouped', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'inbox', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'first', 'index.html'))
        ).toBe(false)
      })

      it('renders an unenumerated slug on hard load and client navigation', async () => {
        const browser = await webdriver(port, '/another/third/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })

          await browser.elementByCss('a[href="/another/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          await browser.elementByCss('a[href="/another/third/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })
        } finally {
          await browser.close()
        }
      })

      it('renders the app not-found page when no fallback route matches', async () => {
        const browser = await webdriver(port, '/missing/route/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'My custom not found page'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('renders catch-all fallback routes on hard load and client navigation', async () => {
        const browser = await webdriver(port, '/docs/guides/export/fallback/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'guides/export/fallback'
            )
          })

          await browser.elementByCss('a[href="/docs/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Docs')
          })

          await browser
            .elementByCss('a[href="/docs/guides/export/fallback/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'guides/export/fallback'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('renders optional catch-all fallback routes for empty and nested params', async () => {
        const browser = await webdriver(port, '/optional/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'optional index'
            )
          })

          await browser.elementByCss('a[href="/optional/deep/path/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('deep/path')
          })
        } finally {
          await browser.close()
        }
      })

      it('renders grouped dynamic fallback routes', async () => {
        const browser = await webdriver(port, '/grouped/from-group/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('from-group')
          })

          await browser.elementByCss('a[href="/grouped/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'Grouped index'
            )
          })

          await browser.elementByCss('a[href="/grouped/from-group/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('from-group')
          })
        } finally {
          await browser.close()
        }
      })

      it('renders fallback params consistently across parallel routes', async () => {
        const browser = await webdriver(port, '/inbox/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Inbox')
            expect(await browser.elementByCss('#modal-thread').text()).toBe(
              'No modal'
            )
          })

          await browser.elementByCss('a[href="/inbox/thread-123/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('thread-123')
            expect(await browser.elementByCss('#modal-thread').text()).toBe(
              'Modal thread-123'
            )
          })

          await browser.get(`http://localhost:${port}/inbox/thread-456/`)
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('thread-456')
            expect(await browser.elementByCss('#modal-thread').text()).toBe(
              'Modal thread-456'
            )
          })
        } finally {
          await browser.close()
        }
      })
    }
  )
}
