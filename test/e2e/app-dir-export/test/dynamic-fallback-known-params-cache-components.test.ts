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
      </ul>
    </main>
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
          await fs.pathExists(join(outDir, 'another', 'first', 'index.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'second', 'index.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'third', 'index.html'))
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
    }
  )
}
