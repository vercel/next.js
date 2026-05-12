import { nextTestSetup } from 'e2e-utils'
import { createReadStream, promises as nodeFs } from 'fs'
import fs from 'fs-extra'
import http from 'http'
import { join } from 'path'
import express from 'express'
import webdriver from 'next-webdriver'
import { fetchViaHTTP, findPort, retry, stopApp } from 'next-test-utils'
import { createRouterAct } from 'router-act'

describe('output-export-dynamic-fallbacks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  it('writes fallback artifacts and resolves hard loads and soft navigations', async () => {
    await next.build()

    const outDir = join(next.testDir, 'out')
    expect(
      await fs.pathExists(join(outDir, 'another', '__fallback.html'))
    ).toBe(true)
    expect(await fs.pathExists(join(outDir, 'another', '__fallback.txt'))).toBe(
      true
    )

    const segmentFiles = await fs.readdir(join(outDir, 'another', '__fallback'))
    expect(segmentFiles).toEqual(
      expect.arrayContaining([
        '__next._full.txt',
        '__next._tree.txt',
        '__next.another.$d$slug.__PAGE__.txt',
      ])
    )
    expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)

    const port = await findPort()
    const app = await startFallbackServer(outDir, port)

    try {
      const res = await fetchViaHTTP(port, '/another/__fallback.html')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Loading slug...')

      const globalFallbackRes = await fetchViaHTTP(port, '/_fallback.html')
      expect(globalFallbackRes.status).toBe(200)
      expect(await globalFallbackRes.text()).toContain(
        '__NEXT_EXPORT_FALLBACK=1'
      )

      const rscRes = await fetchViaHTTP(port, '/another/__fallback.txt')
      expect(rscRes.status).toBe(200)

      const hardLoad = await webdriver(port, '/another/alpha')
      try {
        await retry(async () => {
          expect(await hardLoad.elementByCss('#slug').text()).toBe('alpha')
        })
      } finally {
        await hardLoad.close()
      }

      let act: ReturnType<typeof createRouterAct>
      const softNav = await webdriver(port, '/another', {
        beforePageLoad(page) {
          act = createRouterAct(page)
        },
      })
      try {
        const toggle = await softNav.elementByCss(
          'input[data-link-accordion="/another/alpha"]'
        )

        await act!(async () => {
          await toggle.click()
        })

        await act!(async () => {
          await softNav.elementByCss('a[href="/another/alpha"]').click()
        }, 'no-requests')

        await retry(async () => {
          expect(await softNav.eval('document.body.innerText')).toContain(
            'alpha'
          )
        })
      } finally {
        await softNav.close()
      }
    } finally {
      await stopApp(app)
    }
  })

  it('does not ship fallback client code for regular apps when the flag is disabled', async () => {
    await next.patchFile(
      'next.config.js',
      `/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    outputExportDynamicFallbacks: false,
  },
}

module.exports = nextConfig
`
    )

    await fs.remove(join(next.testDir, 'out'))
    await next.build()

    expect(
      await fs.pathExists(join(next.testDir, 'out', '_fallback.html'))
    ).toBe(false)
    expect(
      await fs.pathExists(
        join(next.testDir, '.next', 'server', 'app', '_fallback.html')
      )
    ).toBe(false)

    const htmlFiles = await readFilesRecursive(
      join(next.testDir, '.next', 'server', 'app'),
      (filename) => filename.endsWith('.html')
    )
    for (const htmlFile of htmlFiles) {
      const html = await fs.readFile(htmlFile, 'utf8')
      expect(html).not.toContain('__NEXT_EXPORT_FALLBACK')
    }

    const clientChunks = await readFilesRecursive(
      join(next.testDir, '.next', 'static', 'chunks'),
      (filename) => filename.endsWith('.js')
    )
    const clientBundle = (
      await Promise.all(clientChunks.map((chunk) => fs.readFile(chunk, 'utf8')))
    ).join('\n')

    expect(clientBundle).not.toContain('output-export-fallback')
    expect(clientBundle).not.toContain('__NEXT_EXPORT_FALLBACK')
    expect(clientBundle).not.toContain('__fallback.meta.json')
  })
})

async function startFallbackServer(outDir: string, port: number) {
  const app = express()
  const server = http.createServer(app)
  const fallbackHtml = join(outDir, '_fallback.html')

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next()
    }

    if (req.path.endsWith('/') || req.path.includes('.')) {
      return next()
    }

    const htmlPath = join(outDir, `${req.path}.html`)
    if (!fs.pathExistsSync(htmlPath)) {
      return next()
    }

    res.sendFile(htmlPath)
  })

  app.use(
    express.static(outDir, {
      extensions: ['html'],
      redirect: false,
    })
  )
  app.use((_req, res) => {
    createReadStream(fallbackHtml).pipe(res)
  })

  await new Promise<void>((resolve) => server.listen(port, resolve))
  return server
}

async function readFilesRecursive(
  dir: string,
  shouldInclude: (filename: string) => boolean
): Promise<string[]> {
  if (!(await fs.pathExists(dir))) {
    return []
  }

  const files: string[] = []
  const entries = await nodeFs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await readFilesRecursive(absolutePath, shouldInclude)))
    } else if (entry.isFile() && shouldInclude(absolutePath)) {
      files.push(absolutePath)
    }
  }
  return files
}
