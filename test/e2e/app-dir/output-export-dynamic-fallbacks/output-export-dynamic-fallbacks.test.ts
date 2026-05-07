import { nextTestSetup } from 'e2e-utils'
import { createReadStream } from 'fs'
import fs from 'fs-extra'
import http from 'http'
import { join } from 'path'
import express from 'express'
import webdriver from 'next-webdriver'
import { fetchViaHTTP, findPort, retry, stopApp } from 'next-test-utils'

describe('output-export-dynamic-fallbacks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  it('writes route fallback HTML and RSC artifacts', async () => {
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
          expect(await hardLoad.elementByCss('h1').text()).toBe('alpha')
        })
      } finally {
        await hardLoad.close()
      }

      const softNav = await webdriver(port, '/another')
      try {
        await softNav.elementByCss('a[href^="/another/alpha"]').click()
        await retry(async () => {
          expect(await softNav.elementByCss('h1').text()).toBe('alpha')
        })
      } finally {
        await softNav.close()
      }
    } finally {
      await stopApp(app)
    }
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
