import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import fs from 'fs-extra'
import express from 'express'
import http from 'http'
import { createReadStream } from 'fs'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..'),
  skipDeployment: true,
  skipStart: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export dynamic routes with Cache Components without trailing slashes', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic routes with Cache Components without trailing slashes',
    () => {
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined

      beforeAll(async () => {
        await next.patchFile('next.config.js', (content) =>
          content.replace(
            'trailingSlash: true,',
            `trailingSlash: false,
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

export default function Page() {
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
          <Link href="/org/acme/chat/thread-flat">Visit org thread</Link>
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
          <Link href="/org/acme/chat/thread-123">Visit org chat thread 123</Link>
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
        const app = express()
        const server = http.createServer(app)
        const outDir = join(next.testDir, 'out')
        const fallbackHtml = join(outDir, '_fallback.html')

        app.use(
          express.static(outDir, {
            extensions: ['html'],
            redirect: false,
          })
        )
        app.use((req, res) => {
          createReadStream(fallbackHtml).pipe(res)
        })

        await new Promise<void>((resolve) => server.listen(port, resolve))
        stopOrKill = () => stopApp(server)
      })

      afterAll(async () => {
        if (stopOrKill) {
          await stopOrKill()
        }
        await next.destroy()
      })

      it('writes flat fallback artifacts for trailingSlash false', async () => {
        const outDir = join(next.testDir, 'out')

        expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', '__fallback.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', '__fallback.txt'))
        ).toBe(true)
        expect(await fs.pathExists(join(outDir, 'org', '__fallback.txt'))).toBe(
          true
        )
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.html')
          )
        ).toBe(false)
      })

      it('renders an unenumerated slug on hard load and client navigation without adding a trailing slash', async () => {
        const browser = await webdriver(port, '/another/third')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another/third'
            )
          })

          await browser.elementByCss('a[href="/another"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another'
            )
          })

          await browser.elementByCss('a[href="/another/third"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another/third'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('preserves search params and hash for nested fallback routes without trailing slashes', async () => {
        const browser = await webdriver(
          port,
          '/org/umbrella/chat/thread-flat?view=full#messages'
        )

        try {
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org umbrella'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'umbrella:thread-flat'
            )
            expect(
              await browser.eval(
                'window.location.pathname + window.location.search + window.location.hash'
              )
            ).toBe('/org/umbrella/chat/thread-flat?view=full#messages')
          })
        } finally {
          await browser.close()
        }
      })
    }
  )
}
