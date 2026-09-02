import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import { SourceMap } from 'module'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import WebSocket from 'ws'

interface InspectorTarget {
  title: string
  url: string
  webSocketDebuggerUrl: string
}

class CDPSession {
  private ws: WebSocket
  private lastId = 0
  private pending = new Map<
    number,
    { resolve: (result: any) => void; reject: (error: Error) => void }
  >()
  onEvent: ((method: string, params: any) => void) | null = null

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString())
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)!
        this.pending.delete(message.id)
        if (message.error) {
          reject(new Error(message.error.message))
        } else {
          resolve(message.result)
        }
      } else if (message.method && this.onEvent) {
        this.onEvent(message.method, message.params)
      }
    })
  }

  static async connect(url: string): Promise<CDPSession> {
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })
    return new CDPSession(ws)
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = ++this.lastId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close(): void {
    this.ws.close()
  }
}

/** CJS script "URLs" from the inspector are plain file paths. */
function scriptURLToFileURL(scriptURL: string): string {
  return scriptURL.startsWith('file://')
    ? scriptURL
    : url.pathToFileURL(scriptURL).href
}

/**
 * Debugger frontends cannot be assumed to fetch arbitrary http(s) URLs
 * themselves (the dedicated Chrome DevTools frontend for Node.js targets
 * does not), so http(s) maps are loaded through the debugged target.
 */
async function resolveSourceMapLikeADebugger(
  session: CDPSession,
  scriptURL: string,
  sourceMapURL: string
): Promise<{ sourceMap: any; mapURL: URL | null }> {
  const dataPrefix = 'data:application/json;base64,'
  if (sourceMapURL.startsWith(dataPrefix)) {
    return {
      sourceMap: JSON.parse(
        Buffer.from(sourceMapURL.slice(dataPrefix.length), 'base64').toString(
          'utf8'
        )
      ),
      mapURL: null,
    }
  }

  if (!/^https?:/.test(sourceMapURL)) {
    const mapURL = new URL(sourceMapURL, scriptURLToFileURL(scriptURL))
    expect(mapURL.protocol).toBe('file:')
    return {
      sourceMap: JSON.parse(fs.readFileSync(url.fileURLToPath(mapURL), 'utf8')),
      mapURL,
    }
  }

  const { resource } = await session.send('Network.loadNetworkResource', {
    url: sourceMapURL,
    options: { disableCache: false, includeCredentials: false },
  })
  if (!resource.success) {
    throw new Error(
      `Unable to load source map through the debugged target: ${sourceMapURL}`
    )
  }
  let data = ''
  while (true) {
    const chunk = await session.send('IO.read', {
      handle: resource.stream,
      size: 1024 * 1024,
    })
    data += chunk.base64Encoded
      ? Buffer.from(chunk.data, 'base64').toString('utf8')
      : chunk.data
    if (chunk.eof) break
  }
  return { sourceMap: JSON.parse(data), mapURL: null }
}

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('app-dir - server source maps - fake frame source maps', () => {
  const dependencies = {
    // `link:` simulates a package in a monorepo
    'internal-pkg': `link:./internal-pkg`,
    'external-pkg': `file:./external-pkg`,
  }
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    dependencies,
    files: path.join(__dirname, 'fixtures/default'),
    // Expose the inspector on a random port.
    startArgs: ['--inspect=0'],
  })

  async function findServerInspectorTarget(): Promise<InspectorTarget> {
    const ports = [
      ...new Set(
        [
          ...next.cliOutput.matchAll(
            /Debugger listening on ws:\/\/127\.0\.0\.1:(\d+)\//g
          ),
        ].map((match) => match[1])
      ),
    ]
    expect(ports.length).toBeGreaterThan(0)

    const targets: InspectorTarget[] = []
    for (const port of ports) {
      try {
        targets.push(
          ...(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())
        )
      } catch {
        // The process may have exited or the port may be gone after a
        // restart.
        continue
      }
    }
    // The process running the server code, as opposed to e.g. the `next dev`
    // CLI wrapper.
    const serverTarget = targets.find((target) =>
      /next-server|start-server\.js|next start/.test(
        `${target.title} ${target.url}`
      )
    )
    if (serverTarget !== undefined) {
      return serverTarget
    }
    if (targets.length === 1) {
      return targets[0]
    }
    throw new Error(
      `Unable to find the server inspector target among ${JSON.stringify(targets.map((target) => target.title))}`
    )
  }

  function expectWellFormedSource(source: string): void {
    // Guards against mangled concatenations like `file:/cwd-relative/path`
    // that substring assertions would hide.
    expect(source).toMatch(/^(file:\/\/\/|turbopack:\/\/|webpack:\/\/)/)
  }

  if (isNextDev) {
    it('fake stack frame source maps are resolvable by an attached debugger', async () => {
      // Render an RSC page so that React materializes fake stack frame
      // functions for the Server Components debug info.
      await next.render('/rsc-error-log')

      const target = await findServerInspectorTarget()
      const session = await CDPSession.connect(target.webSocketDebuggerUrl)
      try {
        const fakeScripts: {
          scriptId: string
          url: string
          sourceMapURL: string
        }[] = []
        session.onEvent = (method, params) => {
          if (
            method === 'Debugger.scriptParsed' &&
            typeof params.url === 'string' &&
            params.url.startsWith('about://React/')
          ) {
            fakeScripts.push({
              scriptId: params.scriptId,
              url: params.url,
              sourceMapURL: params.sourceMapURL ?? '',
            })
          }
        }
        // Enabling the debugger emits `Debugger.scriptParsed` for every
        // script that is still alive, including the already-evaled fake
        // frame scripts.
        await session.send('Debugger.enable', { maxScriptsCacheSize: 1 })

        await retry(async () => {
          expect(fakeScripts.length).toBeGreaterThan(0)
        })

        for (const script of fakeScripts) {
          expect({
            url: script.url,
            hasSourceMap: script.sourceMapURL !== '',
          }).toEqual({ url: script.url, hasSourceMap: true })
        }

        if (isTurbopack) {
          // The resolver silently falls back to inlining `data:` URLs, so a
          // defect in the `file:` URL derivation keeps all behavior-based
          // assertions green. Only this assertion catches it.
          for (const script of fakeScripts) {
            expect({
              url: script.url,
              sourceMapURL: script.sourceMapURL,
            }).toEqual({
              url: script.url,
              sourceMapURL: expect.stringMatching(/^file:/),
            })
          }
        }

        // Resolve each source map like a debugger frontend and map the
        // padded `_()` call position of each fake function back to its
        // original source, like clicking the frame in a debugger would.
        const sourceMapsByURL = new Map<string, any>()
        const mappedSources = new Set<string>()
        for (const script of fakeScripts) {
          let resolved = sourceMapsByURL.get(script.sourceMapURL)
          if (resolved === undefined) {
            resolved = await resolveSourceMapLikeADebugger(
              session,
              script.url,
              script.sourceMapURL
            )
            expect(resolved.sourceMap).toHaveProperty('version', 3)
            sourceMapsByURL.set(script.sourceMapURL, resolved)
          }
          const { sourceMap, mapURL } = resolved

          const { scriptSource } = await session.send(
            'Debugger.getScriptSource',
            { scriptId: script.scriptId }
          )
          const callIndex = scriptSource.indexOf('_()')
          if (callIndex === -1) continue
          const line = scriptSource.slice(0, callIndex).split('\n').length
          const column =
            callIndex - (scriptSource.lastIndexOf('\n', callIndex) + 1)

          const consumer = new SourceMap(sourceMap)
          const original = consumer.findEntry(line - 1, column)
          if (original.originalSource !== undefined) {
            // Relative sources resolve against the map's own URL. Sources in
            // `data:` maps are already absolute.
            mappedSources.add(
              mapURL === null
                ? original.originalSource
                : new URL(original.originalSource, mapURL).href
            )
          }
        }

        for (const source of mappedSources) {
          expectWellFormedSource(source)
        }

        const testDirURL = url.pathToFileURL(fs.realpathSync(next.testDir))
        expect([...mappedSources]).toContain(
          `${testDirURL.href}/app/rsc-error-log/page.js`
        )
      } finally {
        session.close()
      }
    })

    it('fake stack frames from nested Flight requests are resolvable by an attached debugger', async () => {
      // Rendering this page produces fake frame scripts whose frame
      // filenames are `file:` URLs rather than file paths.
      await next.render('/rsc-error-throw-cached')

      const target = await findServerInspectorTarget()
      const session = await CDPSession.connect(target.webSocketDebuggerUrl)
      try {
        const evalScripts: {
          scriptId: string
          url: string
          sourceMapURL: string
        }[] = []
        session.onEvent = (method, params) => {
          if (method === 'Debugger.scriptParsed' && params.hasSourceURL) {
            evalScripts.push({
              scriptId: params.scriptId,
              url: params.url,
              sourceMapURL: params.sourceMapURL ?? '',
            })
          }
        }
        await session.send('Debugger.enable', { maxScriptsCacheSize: 1 })

        await retry(async () => {
          expect(
            evalScripts.filter((script) =>
              script.url.startsWith('about://React/Cache/')
            ).length
          ).toBeGreaterThan(0)
        })

        // React emits a fake frame script under `about://React/` with a
        // source map, or, when no source map could be found for it, under
        // the frame's raw filename without one.
        const fakeScripts = evalScripts.filter(
          (script) =>
            script.url.startsWith('about://React/') ||
            (script.url.startsWith('file:') && script.sourceMapURL === '')
        )
        const mappedSources = new Set<string>()
        for (const script of fakeScripts) {
          expect({
            url: script.url,
            hasSourceMap: script.sourceMapURL !== '',
          }).toEqual({ url: script.url, hasSourceMap: true })

          const { sourceMap, mapURL } = await resolveSourceMapLikeADebugger(
            session,
            script.url,
            script.sourceMapURL
          )
          const { scriptSource } = await session.send(
            'Debugger.getScriptSource',
            { scriptId: script.scriptId }
          )
          const callIndex = scriptSource.indexOf('_()')
          if (callIndex === -1) continue
          const line = scriptSource.slice(0, callIndex).split('\n').length
          const column =
            callIndex - (scriptSource.lastIndexOf('\n', callIndex) + 1)

          const consumer = new SourceMap(sourceMap)
          const original = consumer.findEntry(line - 1, column)
          if (original.originalSource !== undefined) {
            mappedSources.add(
              mapURL === null
                ? original.originalSource
                : new URL(original.originalSource, mapURL).href
            )
          }
        }

        const testDirURL = url.pathToFileURL(fs.realpathSync(next.testDir))
        expect([...mappedSources]).toContain(
          `${testDirURL.href}/app/rsc-error-throw-cached/page.js`
        )
      } finally {
        session.close()
      }
    })
  } else {
    it('server chunk source maps are resolvable by an attached debugger', async () => {
      await next.render('/rsc-error-log')

      const target = await findServerInspectorTarget()
      const session = await CDPSession.connect(target.webSocketDebuggerUrl)
      try {
        const serverScripts: { url: string; sourceMapURL: string }[] = []
        session.onEvent = (method, params) => {
          if (
            method === 'Debugger.scriptParsed' &&
            typeof params.url === 'string' &&
            params.url.includes(`${path.sep}.next${path.sep}server${path.sep}`)
          ) {
            serverScripts.push({
              url: params.url,
              sourceMapURL: params.sourceMapURL ?? '',
            })
          }
        }
        await session.send('Debugger.enable', { maxScriptsCacheSize: 1 })

        await retry(async () => {
          expect(serverScripts.length).toBeGreaterThan(0)
        })

        // Sources in these maps are relative and resolve against the map's
        // own URL.
        const resolvedSources = new Set<string>()
        const mappedScripts: typeof serverScripts = []
        for (const script of serverScripts) {
          if (script.sourceMapURL === '') continue
          const { sourceMap } = await resolveSourceMapLikeADebugger(
            session,
            script.url,
            script.sourceMapURL
          )
          expect(sourceMap).toHaveProperty('version', 3)
          const mapURL = new URL(
            script.sourceMapURL,
            scriptURLToFileURL(script.url)
          )
          for (const source of sourceMap.sources as string[]) {
            const resolved = new URL(source, mapURL).href
            expectWellFormedSource(resolved)
            resolvedSources.add(resolved)
          }
          mappedScripts.push(script)
        }

        // The build output must reference source maps at all
        // (`serverSourceMaps` is enabled in the fixture).
        expect(mappedScripts.length).toBeGreaterThan(0)
        const testDirURL = url.pathToFileURL(fs.realpathSync(next.testDir))
        expect([...resolvedSources]).toContain(
          isTurbopack
            ? `${testDirURL.href}/app/rsc-error-log/page.js`
            : 'webpack:///app/rsc-error-log/page.js'
        )
      } finally {
        session.close()
      }
    })
  }
})
