import glob from 'glob'
import fs from 'fs-extra'
import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

describe('should set-up next', () => {
  let next: NextInstance
  let server
  let appPort

  const setupNext = async ({
    nextEnv,
    minimalMode,
  }: {
    nextEnv?: boolean
    minimalMode?: boolean
  }) => {
    // test build against environment with next support
    process.env.NOW_BUILDER = nextEnv ? '1' : ''

    next = await createNext({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        lib: new FileRef(join(__dirname, 'lib')),
        'middleware.js': new FileRef(join(__dirname, 'middleware.js')),
        'data.txt': new FileRef(join(__dirname, 'data.txt')),
        '.env': new FileRef(join(__dirname, '.env')),
        '.env.local': new FileRef(join(__dirname, '.env.local')),
        '.env.production': new FileRef(join(__dirname, '.env.production')),
      },
      nextConfig: {
        eslint: {
          ignoreDuringBuilds: true,
        },
        experimental: {
          appDir: true,
        },
        output: 'standalone',
      },
    })
    await next.stop()

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )
    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
        console.log('removed', file)
      }
    }
    const files = glob.sync('**/*', {
      cwd: join(next.testDir, 'standalone/.next/server/pages'),
      dot: true,
    })

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.html')) {
        await fs.remove(join(next.testDir, '.next/server', file))
      }
    }

    const testServer = join(next.testDir, 'standalone/server.js')
    await fs.writeFile(
      testServer,
      (
        await fs.readFile(testServer, 'utf8')
      ).replace('conf:', `minimalMode: ${minimalMode},conf:`)
    )
    appPort = await findPort()
    server = await initNextServerScript(
      testServer,
      /Listening on/,
      {
        ...process.env,
        PORT: appPort,
      },
      undefined,
      {
        cwd: next.testDir,
      }
    )
  }

  beforeAll(async () => {
    await setupNext({ nextEnv: true, minimalMode: true })
  })
  afterAll(async () => {
    await next.destroy()
    if (server) await killApp(server)
  })

  it('should send cache tags in minimal mode for ISR', async () => {
    for (const [path, tags] of [
      ['/isr/first', 'isr-page,/isr/[slug]/page'],
      ['/isr/second', 'isr-page,/isr/[slug]/page'],
      ['/api/isr/first', 'isr-page,/api/isr/[slug]/route'],
      ['/api/isr/second', 'isr-page,/api/isr/[slug]/route'],
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-next-cache-tags')).toBe(tags)
    }
  })

  it('should not send cache tags in minimal mode for SSR', async () => {
    for (const path of [
      '/ssr/first',
      '/ssr/second',
      '/api/ssr/first',
      '/api/ssr/second',
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-next-cache-tags')).toBeFalsy()
    }
  })
})
