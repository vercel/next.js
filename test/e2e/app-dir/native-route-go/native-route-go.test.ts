import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP, findPort, retry } from 'next-test-utils'
import { request } from 'http'
import { promises as fs } from 'fs'
import { dirname, join, relative } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import type { AdapterOutput, NextAdapter } from 'next'

// @force-gate turbopack
describe('native-route-go', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    // Provider deployment requires an adapter that packages Go outputs. This
    // fixture exercises local native processes and adapter build artifacts.
    skipDeployment: true,
  })
  const route = 'app/(group)/native/[id]/route.go'
  const helper = 'app/(group)/native/[id]/helper.go'
  const nativePids = new Set<number>()
  const asset = 'app/(group)/native/[id]/assets/message.txt'
  const data = async (url = '/native/example') => {
    const response = await next.fetch(url)
    expect(response.status).toBe(201)
    const result = await response.json()
    nativePids.add(result.pid)
    return result
  }
  afterAll(async () => {
    for (const pid of nativePids) {
      await retry(async () => {
        expect(() => process.kill(pid, 0)).toThrow()
      })
    }
  })
  it('serves native methods, params, headers, cookies, query, and streamed request bodies', async () => {
    const response = await next.fetch('/native/a%20b?key=one&key=two', {
      method: 'POST',
      body: 'request body',
    })
    expect(response.status).toBe(201)
    expect(response.headers.get('x-native-route')).toBe('yes')
    expect(response.headers.get('set-cookie')).toContain('first=1')
    expect(response.headers.get('set-cookie')).toContain('second=2')
    expect(await response.json()).toMatchObject({
      id: 'a b',
      method: 'POST',
      query: 'key=one&key=two',
      body: 'request body',
      sibling: 'sibling-v1',
      dependency: 'transitive-v1',
      embedded: 'embedded-v1',
      proxy: '1',
    })
    const head = await next.fetch('/native/head', { method: 'HEAD' })
    expect(head.status).toBe(201)
    expect(await head.text()).toBe('')
    const options = await next.fetch('/native/options', { method: 'OPTIONS' })
    expect(options.status).toBe(204)
    expect(options.headers.get('allow')).toBe('GET, HEAD, POST, OPTIONS')
    expect(
      (await next.fetch('/native/method', { method: 'DELETE' })).status
    ).toBe(405)
  })
  it('uses Node routing, rewrites and proxy exactly once and coexists with JS and Pages', async () => {
    expect(await data('/rewritten/rewritten')).toMatchObject({
      id: 'rewritten',
      proxy: '1',
    })
    expect(await data('/proxy-target')).toMatchObject({
      id: 'proxy',
      proxy: '1',
    })
    expect(await (await next.fetch('/catch/one/two%20three')).json()).toEqual([
      'one',
      'two three',
    ])
    expect(await (await next.fetch('/js')).json()).toEqual({ language: 'js' })
    expect(await next.render('/legacy')).toContain('legacy page')
    expect(await next.render('/')).toContain('hello world')
  })
  it('reuses the process and ignores forged native metadata', async () => {
    const first = await data()
    expect((await data()).pid).toBe(first.pid)
    const response = await next.fetch('/native/trusted', {
      headers: { 'x-next-go-token': 'forged', 'x-next-go-params': 'forged' },
    })
    expect((await response.json()).id).toBe('trusted')
  })
  it('preserves repeated request headers and cancels streaming responses', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = request(
        next.url + '/native/repeated',
        { headers: { 'x-repeated': ['one', 'two'], constructor: 'safe' } },
        (res) => {
          let body = ''
          res.on('data', (chunk) => {
            body += chunk
          })
          res.on('end', () => {
            try {
              expect(JSON.parse(body).repeated).toEqual(['one', 'two'])
              resolve()
            } catch (err) {
              reject(err)
            }
          })
        }
      )
      req.on('error', reject)
      req.end()
    })
    await new Promise<void>((resolve, reject) => {
      const req = request(next.url + '/native/stream?stream=1', (res) => {
        res.once('data', (chunk) => {
          expect(chunk.toString()).toBe('first')
          res.destroy()
          resolve()
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect((await data()).id).toBe('example')
  })
  it('recovers after a native process crash', async () => {
    const first = await data()
    expect((await next.fetch('/native/crash?crash=1')).status).toBe(500)
    await retry(async () => {
      expect((await data()).pid).not.toBe(first.pid)
    })
  })
  if (isNextDev) {
    it('rebuilds route, siblings, transitive imports and embeds, and repairs compiler errors', async () => {
      const initial = await data()
      await next.patchFile(helper, (s) => s.replace('sibling-v1', 'sibling-v2'))
      await retry(async () => {
        const current = await data()
        expect(current.sibling).toBe('sibling-v2')
        expect(current.pid).not.toBe(initial.pid)
      })
      await retry(async () => {
        expect(() => process.kill(initial.pid, 0)).toThrow()
      })
      await fs.writeFile(
        join(next.testDir, helper),
        'package main\nfunc sibling() string { return "sibling-immediate" }\n'
      )
      // No watcher-settling delay: the first request must ensure current inputs.
      expect((await data()).sibling).toBe('sibling-immediate')
      await next.patchFile('internal/deep/message.go', (s) =>
        s.replace('transitive-v1', 'transitive-v2')
      )
      await retry(async () => {
        expect((await data()).dependency).toBe('transitive-v2')
      })
      await next.patchFile(asset, 'embedded-v2')
      await retry(async () => {
        expect((await data()).embedded).toBe('embedded-v2')
      })
      await next.patchFile('app/(group)/native/[id]/assets/extra.txt', 'extra')
      await retry(async () => {
        expect((await data()).assetCount).toBe(2)
      })
      await next.deleteFile('app/(group)/native/[id]/assets/extra.txt')
      await retry(async () => {
        expect((await data()).assetCount).toBe(1)
      })
      const original = await next.readFile(route)
      await next.patchFile(
        route,
        original.replace('func Handle', 'invalid syntax\nfunc Handle')
      )
      await retry(async () => {
        expect((await next.fetch('/native/error')).status).toBe(500)
      })
      expect(next.cliOutput).toContain('route.go')
      await next.patchFile(route, original)
      await retry(async () => {
        expect((await data()).id).toBe('example')
      })
    })
    it('caches startup errors and repairs them after an edit', async () => {
      const path = 'app/startup/route.go'
      const source =
        'package main\nimport "net/http"\nvar Methods = []string{"GET"}\nfunc init() { panic("startup-fixture-error") }\nfunc Handle(w http.ResponseWriter, r *http.Request) { w.Write([]byte("recovered")) }\n'
      await next.patchFile(path, source)
      expect((await next.fetch('/startup')).status).toBe(500)
      const failures = () =>
        (next.cliOutput.match(/panic: startup-fixture-error/g) || []).length
      expect(failures()).toBe(1)
      expect((await next.fetch('/startup')).status).toBe(500)
      expect(failures()).toBe(1)
      await next.patchFile(
        path,
        source.replace('func init() { panic("startup-fixture-error") }', '')
      )
      await retry(async () => {
        expect(await next.render('/startup')).toBe('recovered')
      })
    })
    it('discovers route additions, removals and renames', async () => {
      const source = await next.readFile('app/catch/[...slug]/route.go')
      await next.patchFile('app/added/route.go', source)
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(200)
      })
      await next.renameFolder('app/added', 'app/renamed')
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(404)
        expect((await next.fetch('/renamed')).status).toBe(200)
      })
      await next.deleteFile('app/renamed/route.go')
      await retry(async () => {
        expect((await next.fetch('/renamed')).status).toBe(404)
      })
    })
  }
  if (isNextStart) {
    it('starts relocated output without a Go toolchain', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/server/app-paths-manifest.json')
      )
      const entry = manifest['/(group)/native/[id]/route']
      const descriptor = JSON.parse(
        await next.readFile('.next/server/' + entry)
      )
      const trace = JSON.parse(
        await next.readFile('.next/server/' + entry + '.nft.json')
      )
      expect(trace.files).toHaveLength(1)
      expect(trace.files[0]).toContain('route-')
      const metadata = await fs.stat(
        join(next.testDir, '.next/server', descriptor.executable)
      )
      if (process.platform !== 'win32')
        expect(metadata.mode & 0o111).not.toBe(0)
      await next.stop()
      await next.renameFolder('.next', '.next-relocated')
      const config = await next.readFile('next.config.ts')
      await next.patchFile(
        'next.config.ts',
        config.replace(
          'experimental:',
          "distDir: '.next-relocated',\n  experimental:"
        )
      )
      await next.start({
        skipBuild: true,
        env: { TURBOPACK_GO: '/missing-go-toolchain' },
      })
      expect((await data()).id).toBe('example')
    })
    it('emits standalone Go adapter outputs alongside existing Node outputs', async () => {
      await next.stop()
      await next.patchFile('next.config.ts', (config) =>
        config.replace(
          'experimental:',
          `basePath: '/adapter-base',\n  adapterPath: ${JSON.stringify(join(next.testDir, 'capture-adapter.mjs'))},\n  experimental:`
        )
      )
      const result = await next.build()
      expect(result.exitCode).toBe(0)

      const context: Parameters<NextAdapter['onBuildComplete']>[0] =
        await next.readJSON('go-adapter-output.json')
      const goOutputs = context.outputs.appRoutes.filter(
        (output) => output.runtime === 'go'
      )
      const nodeOutput = context.outputs.appRoutes.find(
        (output) => output.pathname === '/adapter-base/js'
      )!
      expect(nodeOutput.runtime).toBe('nodejs')
      expect(nodeOutput.filePath).toMatch(/\.js$/)
      expect(context.outputs.staticFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pathname: '/adapter-base/legacy',
            type: 'STATIC_FILE',
            filePath: expect.stringMatching(/\.html$/),
          }),
        ])
      )
      expect(
        context.outputs.pages.every((output) => output.runtime === 'nodejs')
      ).toBe(true)
      expect(goOutputs.map((output) => output.pathname).sort()).toEqual([
        '/adapter-base/adapter-optional/[[...slug]]',
        '/adapter-base/adapter-special/café a 100%',
        '/adapter-base/adapter-static',
        '/adapter-base/catch/[...slug]',
        '/adapter-base/native/[id]',
      ])
      for (const output of goOutputs) {
        expect(output.type).toBe('APP_ROUTE')
        // Go changes the runtime value without adding producer metadata keys.
        expect(Object.keys(output).sort()).toEqual(
          Object.keys(nodeOutput).sort()
        )
        expect(output).not.toHaveProperty('sourceFile')
        expect(output).not.toHaveProperty('target')
        expect(output.filePath).not.toMatch(/\.native\.json$/)
        expect(Object.values(output.assets)).not.toContain(output.filePath)
        expect(
          Object.values(output.assets).some((file) =>
            file.replace(/\\/g, '/').includes('/node_modules/next/')
          )
        ).toBe(false)
        const executable = await fs.readFile(output.filePath)
        const entryHash = createHash('sha256')
          .update(context.config.outputHashSalt || '')
          .update('file:')
          .update(executable)
          .digest('hex')
        expect(
          output.assetsHashes[
            relative(context.repoRoot, output.filePath).replace(/\\/g, '/')
          ]
        ).toBe(entryHash)
        for (const [destination, file] of Object.entries(output.assets)) {
          expect(output.assetsHashes[destination]).toBe(
            createHash('sha256')
              .update(context.config.outputHashSalt || '')
              .update('file:')
              .update(await fs.readFile(file))
              .digest('hex')
          )
        }
      }

      const nativeOutput = goOutputs.find(
        (output) => output.pathname === '/adapter-base/native/[id]'
      )!
      expect(nativeOutput.sourcePage).toBe('/(group)/native/[id]/route')
      expect(nativeOutput.id).toBe('/native/[id]')
      expect(nativeOutput.config).toEqual({})
      expect(
        context.outputs.appPages.some(
          (output) => output.sourcePage === nativeOutput.sourcePage
        )
      ).toBe(false)

      async function withStandaloneRoute(
        output: AdapterOutput['APP_ROUTE'],
        run: (port: number) => Promise<void>,
        options: { routing?: string; startupError?: boolean } = {}
      ) {
        const directory = await fs.mkdtemp(join(tmpdir(), 'go-adapter-route-'))
        let child: ReturnType<typeof spawn> | undefined
        let closed: Promise<void> | undefined
        try {
          for (const [destination, source] of Object.entries(output.assets)) {
            const file = join(directory, destination)
            await fs.mkdir(dirname(file), { recursive: true })
            await fs.copyFile(source, file)
          }
          const executable = join(
            directory,
            process.platform === 'win32' ? 'user-server.exe' : 'user-server'
          )
          await fs.copyFile(output.filePath, executable)
          await fs.chmod(executable, 0o755)
          const port = await findPort()
          const env: NodeJS.ProcessEnv = {
            ...process.env,
            PORT: String(port),
          }
          delete env.__NEXT_GO_TOKEN
          delete env.NEXT_GO_ADAPTER_ROUTING
          if (options.routing !== undefined) {
            env.NEXT_GO_ADAPTER_ROUTING = options.routing
          }
          child = spawn(executable, [], {
            cwd: directory,
            env,
            // Adapter servers must not depend on a parent-owned stdin pipe.
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          closed = new Promise((resolve) =>
            child!.once('close', () => resolve())
          )
          let failure: Error | undefined
          child.once('error', (error) => {
            failure = error
          })
          let stderr = ''
          child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString()
          })
          if (options.startupError) {
            await retry(async () => {
              if (failure) throw failure
              expect(child!.exitCode).not.toBeNull()
            })
            await closed
            expect(child.exitCode).not.toBe(0)
            expect(stderr).toContain('invalid NEXT_GO_ADAPTER_ROUTING')
            return
          }
          await retry(async () => {
            if (failure) throw failure
            if (child!.exitCode !== null) {
              throw new Error(`Adapter server exited: ${stderr}`)
            }
            const response = await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/unmatched-readiness'
            )
            expect(response.status).toBe(options.routing ? 400 : 404)
          })
          await run(port)
        } finally {
          if (child) {
            child.kill()
            await closed
          }
          await fs.rm(directory, { recursive: true, force: true })
        }
      }

      await withStandaloneRoute(nativeOutput, async (port) => {
        const response = await fetchViaHTTP(
          `http://127.0.0.1:${port}`,
          '/adapter-base/native/a%20b?key=one&key=two',
          undefined,
          {
            method: 'POST',
            body: 'adapter request body',
            headers: {
              'x-next-go-token': 'forged',
              'x-next-go-params': 'forged',
            },
          }
        )
        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({
          id: 'a b',
          method: 'POST',
          query: 'key=one&key=two',
          body: 'adapter request body',
          sibling: 'sibling-v1',
          dependency: 'transitive-v1',
          embedded: 'embedded-v1',
          proxy: '',
        })
        expect(response.headers.get('set-cookie')).toContain('first=1')
        expect(response.headers.get('set-cookie')).toContain('second=2')
        const options = await fetchViaHTTP(
          `http://127.0.0.1:${port}`,
          '/adapter-base/native/options',
          undefined,
          { method: 'OPTIONS' }
        )
        expect(options.status).toBe(204)
        expect(options.headers.get('allow')).toBe('GET, HEAD, POST, OPTIONS')
        expect(
          (
            await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/adapter-base/native/method',
              undefined,
              { method: 'DELETE' }
            )
          ).status
        ).toBe(405)
        await new Promise<void>((resolve, reject) => {
          const req = request(
            `http://127.0.0.1:${port}/adapter-base/native/stream?stream=1`,
            (res) => {
              res.once('data', (chunk) => {
                try {
                  expect(chunk.toString()).toBe('first')
                  res.destroy()
                  resolve()
                } catch (error) {
                  reject(error)
                }
              })
            }
          )
          req.setTimeout(5000, () => req.destroy(new Error('Stream timed out')))
          req.on('error', reject)
          req.end()
        })
        const forged = await fetchViaHTTP(
          `http://127.0.0.1:${port}`,
          '/alias',
          undefined,
          {
            headers: {
              'x-test-go-routing-path': '/adapter-base/native/forged',
            },
          }
        )
        expect(forged.status).toBe(404)
        const direct = await fetchViaHTTP(
          `http://127.0.0.1:${port}`,
          '/adapter-base/native/direct?nxtPid=caller',
          undefined,
          {
            headers: {
              'x-test-go-routing-path': '/adapter-base/native/forged',
            },
          }
        )
        expect(await direct.json()).toMatchObject({
          id: 'direct',
          query: 'nxtPid=caller',
        })
      })
      await withStandaloneRoute(
        goOutputs.find(
          (output) => output.pathname === '/adapter-base/catch/[...slug]'
        )!,
        async (port) => {
          const response = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/adapter-base/catch/one/two%20three'
          )
          expect(response.status).toBe(200)
          expect(await response.json()).toEqual(['one', 'two three'])
        }
      )

      const routing = JSON.stringify({
        version: 1,
        pathHeader: 'x-test-go-routing-path',
      })
      await withStandaloneRoute(
        nativeOutput,
        async (port) => {
          const publicURL = '/alias?key=%2f&key=one+two&nxtPid=caller'
          const response = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            publicURL,
            undefined,
            {
              method: 'POST',
              body: 'rewritten body',
              headers: {
                'x-test-go-routing-path': '/adapter-base/native/a%2Fb',
                'x-next-go-token': 'forged',
                'x-next-go-params': 'forged',
              },
            }
          )
          expect(response.status).toBe(201)
          expect(await response.json()).toMatchObject({
            id: 'a/b',
            path: '/alias',
            requestURI: publicURL,
            query: 'key=%2f&key=one+two&nxtPid=caller',
            body: 'rewritten body',
            routingHeader: '',
          })
          const samePatternRewrite = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/adapter-base/native/original',
            undefined,
            {
              headers: {
                'x-test-go-routing-path': '/adapter-base/native/rewritten',
              },
            }
          )
          expect(await samePatternRewrite.json()).toMatchObject({
            id: 'rewritten',
            path: '/adapter-base/native/original',
            requestURI: '/adapter-base/native/original',
          })
          const missing = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/adapter-base/native/direct'
          )
          expect(missing.status).toBe(400)
          for (const value of [
            '',
            'relative/path',
            '//other/native/value',
            '/adapter-base/native/value?query=1',
            '/adapter-base/native/value#fragment',
            '/adapter-base/native/a\\b',
            '/adapter-base/native/a b',
            '/adapter-base/native/%invalid',
          ]) {
            const invalid = await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/alias',
              undefined,
              { headers: { 'x-test-go-routing-path': value } }
            )
            expect(invalid.status).toBe(400)
          }
          await new Promise<void>((resolve, reject) => {
            const req = request(
              `http://127.0.0.1:${port}/alias`,
              {
                headers: {
                  'x-test-go-routing-path': [
                    '/adapter-base/native/first',
                    '/adapter-base/native/second',
                  ],
                },
              },
              (res) => {
                res.resume()
                res.once('end', () => {
                  try {
                    expect(res.statusCode).toBe(400)
                    resolve()
                  } catch (error) {
                    reject(error)
                  }
                })
              }
            )
            req.on('error', reject)
            req.end()
          })
          const unmatched = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/alias',
            undefined,
            { headers: { 'x-test-go-routing-path': '/adapter-base/unrelated' } }
          )
          expect(unmatched.status).toBe(404)
        },
        { routing }
      )
      await withStandaloneRoute(
        goOutputs.find(
          (output) => output.pathname === '/adapter-base/catch/[...slug]'
        )!,
        async (port) => {
          const response = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/catch-alias',
            undefined,
            {
              headers: {
                'x-test-go-routing-path':
                  '/adapter-base/catch/one%2Ftwo/three%20four',
              },
            }
          )
          expect(response.status).toBe(200)
          expect(await response.json()).toEqual(['one/two', 'three four'])
        },
        { routing }
      )
      await withStandaloneRoute(
        goOutputs.find(
          (output) =>
            output.pathname === '/adapter-base/adapter-optional/[[...slug]]'
        )!,
        async (port) => {
          for (const [path, params] of [
            ['/adapter-base/adapter-optional', null],
            [
              '/adapter-base/adapter-optional/one%2Ftwo/three%20four',
              ['one/two', 'three four'],
            ],
          ] as const) {
            const response = await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/optional-alias?key=%252f',
              undefined,
              { headers: { 'x-test-go-routing-path': path } }
            )
            expect(response.status).toBe(200)
            expect(await response.json()).toMatchObject({
              params,
              path: '/optional-alias',
              requestURI: '/optional-alias?key=%252f',
              query: 'key=%252f',
              routingHeader: '',
            })
          }
        },
        { routing }
      )
      await withStandaloneRoute(
        goOutputs.find(
          (output) => output.pathname === '/adapter-base/adapter-static'
        )!,
        async (port) => {
          const response = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/static-alias?key=%2f&key=one+two',
            undefined,
            { headers: { 'x-matched-path': '/adapter-base/adapter-static' } }
          )
          expect(response.status).toBe(200)
          expect(await response.json()).toMatchObject({
            path: '/static-alias',
            requestURI: '/static-alias?key=%2f&key=one+two',
            query: 'key=%2f&key=one+two',
          })
        },
        {
          routing: JSON.stringify({ version: 1, pathHeader: 'x-matched-path' }),
        }
      )
      await withStandaloneRoute(
        goOutputs.find(
          (output) =>
            output.pathname === '/adapter-base/adapter-special/café a 100%'
        )!,
        async (port) => {
          const response = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/special-alias?key=unchanged',
            undefined,
            {
              headers: {
                'x-test-go-routing-path':
                  '/adapter-base/adapter-special/caf%C3%A9%20a%20100%25',
              },
            }
          )
          expect(response.status).toBe(200)
          expect(await response.json()).toMatchObject({
            path: '/special-alias',
            requestURI: '/special-alias?key=unchanged',
            query: 'key=unchanged',
            routingHeader: '',
          })
        },
        { routing }
      )
      for (const invalid of [
        '{',
        'null',
        JSON.stringify({ version: 2, pathHeader: 'x-test-go-routing-path' }),
        JSON.stringify({ version: 1 }),
        JSON.stringify({ version: 1, pathHeader: '' }),
        JSON.stringify({ version: 1, pathHeader: 'invalid header' }),
        JSON.stringify({ version: 1, pathHeader: ':invalid' }),
        JSON.stringify({ version: 1, pathHeader: 'x-path', unknown: true }),
        `${routing} {}`,
      ]) {
        await withStandaloneRoute(nativeOutput, async () => {}, {
          routing: invalid,
          startupError: true,
        })
      }

      const providerBuild = await next.build({
        env: {
          NEXT_ADAPTER_VERCEL_GO_TARGET: JSON.stringify({
            os: 'linux',
            architecture: 'x86_64',
            linking: 'static',
          }),
        },
      })
      expect(providerBuild.exitCode).toBe(0)
      const providerContext: Parameters<NextAdapter['onBuildComplete']>[0] =
        await next.readJSON('go-adapter-output.json')
      const providerGoOutputs = providerContext.outputs.appRoutes.filter(
        (output) => output.runtime === 'go'
      )
      const providerNodeOutput = providerContext.outputs.appRoutes.find(
        (output) => output.pathname === '/adapter-base/js'
      )!
      expect(providerGoOutputs).toHaveLength(5)
      for (const output of providerGoOutputs) {
        expect(Object.keys(output).sort()).toEqual(
          Object.keys(providerNodeOutput).sort()
        )
        expect(output).not.toHaveProperty('sourceFile')
        expect(output).not.toHaveProperty('target')
        expect(output.filePath).not.toMatch(/\.exe$/)
        // Inspect the provider target without executing it on macOS/Windows.
        const executable = await fs.readFile(output.filePath)
        expect(executable.subarray(0, 4)).toEqual(
          Buffer.from([0x7f, 0x45, 0x4c, 0x46])
        )
        expect(executable[4]).toBe(2) // ELFCLASS64
        expect(executable[5]).toBe(1) // Little endian
        expect(executable.readUInt16LE(18)).toBe(62) // EM_X86_64
      }

      const invalidProviderBuild = await next.build({
        env: {
          NEXT_ADAPTER_VERCEL_GO_TARGET: JSON.stringify({
            os: 'linux',
            architecture: 'arm64',
            linking: 'static',
          }),
        },
      })
      expect(invalidProviderBuild.exitCode).not.toBe(0)
      expect(invalidProviderBuild.cliOutput).toContain(
        'NEXT_ADAPTER_VERCEL_GO_TARGET'
      )
    })
  }
})

// @force-gate turbopack
describe('native-route-go in src/app', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // This fixture exercises local native process lifecycle and source edits.
    skipDeployment: true,
  })
  beforeAll(async () => {
    await fs.mkdir(join(next.testDir, 'src'))
    await next.renameFolder('app', 'src/app')
    await next.renameFolder('pages', 'src/pages')
    await next.renameFile('proxy.ts', 'src/proxy.ts')
    await next.start()
  })
  it('discovers grouped native handlers below src/app', async () => {
    const response = await next.fetch('/native/source')
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      id: 'source',
      sibling: 'sibling-v1',
      proxy: '1',
    })
  })
})

describe('native route diagnostics', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // This fixture inspects local compiler diagnostics rather than deployments.
    skipDeployment: true,
  })
  it('reports unsupported native handlers when building with Webpack', async () => {
    const result = await next.runCommand(['build', '--webpack'], {
      env: {
        IS_TURBOPACK_TEST: '',
        IS_WEBPACK_TEST: '1',
        NEXT_RSPACK: '',
        NEXT_TEST_USE_RSPACK: '',
      },
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout + result.stderr).toContain(
      'route.go requires Turbopack'
    )
  })
  it('diagnoses conflicting Go and TS handlers', async () => {
    await next.patchFile(
      'app/(group)/native/[id]/route.ts',
      'export function GET() { return new Response("conflict") }'
    )
    const result = await next.runCommand(['build', '--turbopack'], {
      env: {
        IS_WEBPACK_TEST: '',
        IS_TURBOPACK_TEST: '1',
        NEXT_RSPACK: '',
        NEXT_TEST_USE_RSPACK: '',
      },
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout + result.stderr).toContain(
      'Conflicting App Router handlers'
    )
  })
})
