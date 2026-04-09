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
  describe.skip('app dir - output export dynamic routes with Cache Components and known prerenders', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic routes with Cache Components and known prerenders',
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

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

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
        <li>
          <Link href="/another/third">Visit another third (fallback)</Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/org/page.js',
          `import Link from 'next/link'

export default function OrgIndexPage() {
  return (
    <main>
      <h1>Org index</h1>
      <ul>
        <li>
          <Link href="/org/acme/chat/thread-123">
            Visit known org chat thread
          </Link>
        </li>
        <li>
          <Link href="/org/acme/chat/thread-789">
            Visit fallback org chat thread
          </Link>
        </li>
      </ul>
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/org/[org]/org-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function OrgClient() {
  const params = useParams()

  return <p id="org-name">Org {params.org}</p>
}
`
        )

        await next.patchFile(
          'app/org/[org]/layout.js',
          `import { Suspense } from 'react'
import OrgClient from './org-client'

export default function OrgLayout({ children }) {
  return (
    <main>
      <Suspense fallback={<p id="org-name">Loading org...</p>}>
        <OrgClient />
      </Suspense>
      {children}
    </main>
  )
}
`
        )

        await next.patchFile(
          'app/org/[org]/chat/[thread]/thread-client.js',
          `'use client'

import { useParams } from 'next/navigation'

export default function OrgThreadClient() {
  const params = useParams()

  return <h1>{params.org}:{params.thread}</h1>
}
`
        )

        await next.patchFile(
          'app/org/[org]/chat/[thread]/page.js',
          `import Link from 'next/link'
import { Suspense } from 'react'
import OrgThreadClient from './thread-client'

export function generateStaticParams() {
  return [
    { org: 'acme', thread: 'thread-123' },
    { org: 'acme', thread: 'thread-456' },
  ]
}

export default function OrgThreadPage() {
  return (
    <>
      <Suspense fallback={<h1>Loading org thread...</h1>}>
        <OrgThreadClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/org">Visit org index</Link>
        </li>
        <li>
          <Link href="/org/acme/chat/thread-789">
            Visit fallback org chat thread
          </Link>
        </li>
      </ul>
    </>
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

      it('emits both prerendered known params and fallback artifacts', async () => {
        const outDir = join(next.testDir, 'out')

        expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'org', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'first', 'index.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'second', 'index.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'third', 'index.html'))
        ).toBe(false)
        expect(
          await fs.pathExists(
            join(outDir, 'org', 'acme', 'chat', 'thread-123', 'index.html')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'org', 'acme', 'chat', 'thread-789', 'index.html')
          )
        ).toBe(false)
      })

      it('serves both prerendered and fallback params', async () => {
        const browser = await webdriver(port, '/another/first/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })

          await browser.get(`http://localhost:${port}/another/third/`)
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })
        } finally {
          await browser.close()
        }
      })

      it('serves both prerendered and fallback params for nested dynamic routes', async () => {
        const browser = await webdriver(port, '/org/acme/chat/thread-123/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })

          await browser.get(
            `http://localhost:${port}/org/acme/chat/thread-789/`
          )
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-789'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('client navigates from a prerendered page to a fallback route', async () => {
        // Start on a prerendered page (known from generateStaticParams)
        const browser = await webdriver(port, '/another/first/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })

          // Client navigate to an unenumerated slug (fallback)
          await browser.elementByCss('a[href="/another/third/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })

          // Navigate back to the prerendered page
          await browser.elementByCss('a[href="/another/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          // Navigate to a different prerendered page
          await browser.elementByCss('a[href="/another/first/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })
        } finally {
          await browser.close()
        }
      })

      it('client navigates from a fallback route to a prerendered page', async () => {
        // Start on a fallback route (not in generateStaticParams)
        const browser = await webdriver(port, '/org/acme/chat/thread-789/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-789'
            )
          })

          // Client navigate to a prerendered page (known from generateStaticParams)
          await browser.elementByCss('a[href="/org/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Org index')
          })

          await browser
            .elementByCss('a[href="/org/acme/chat/thread-123/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('navigates from a known prerendered param to an unknown param via client nav then back', async () => {
        const browser = await webdriver(port, '/org/acme/chat/thread-123/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })

          // Client navigate to a fallback param
          await browser
            .elementByCss('a[href="/org/acme/chat/thread-789/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-789'
            )
          })

          // Browser back to the prerendered page
          await browser.back()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })
        } finally {
          await browser.close()
        }
      })
    }
  )
}
