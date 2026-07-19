import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import WebSocket from 'ws'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  SourceMapConsumer: SyncSourceMapConsumer,
} = require('next/dist/compiled/source-map')

interface InspectorTarget {
  title: string
  url: string
  webSocketDebuggerUrl: string
}

/** Minimal Chrome DevTools Protocol client on top of `ws`. */
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

describe('app-dir - server source maps - fake frame source map URLs', () => {
  const dependencies = {
    // `link:` simulates a package in a monorepo
    'internal-pkg': `link:./internal-pkg`,
    'external-pkg': `file:./external-pkg`,
  }
  const { skipped, next, isNextDev } = nextTestSetup({
    dependencies,
    files: path.join(__dirname, 'fixtures/default'),
    skipDeployment: true,
    env: {
      // Expose the inspector on a random port so that the test can observe
      // the scripts React evals for fake Server Component stack frames the
      // same way an attached debugger would.
      NODE_OPTIONS: '--inspect=0',
    },
  })

  if (skipped) return

  if (!isNextDev) {
    it('should skip other scenarios', () => {})
    return
  }

  async function findServerInspectorTarget(): Promise<InspectorTarget> {
    // `--inspect=0` in NODE_OPTIONS makes every Node.js process of `next dev`
    // (CLI wrapper and the next-server child) listen on a random port. Find
    // the one hosting the server code.
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

    for (const port of ports) {
      let targets: InspectorTarget[]
      try {
        targets = await (
          await fetch(`http://127.0.0.1:${port}/json/list`)
        ).json()
      } catch {
        // The process may have exited (e.g. the CLI wrapper) or the port may
        // be gone after a restart.
        continue
      }
      for (const target of targets) {
        if (
          /next-server|start-server\.js/.test(`${target.title} ${target.url}`)
        ) {
          return target
        }
      }
    }
    throw new Error(
      `Unable to find the next-server inspector target on ports ${ports.join(', ')}`
    )
  }

  it('references fake stack frame source maps by URL instead of inlining data: URLs', async () => {
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
      // Enabling the debugger emits `Debugger.scriptParsed` for every script
      // that is still alive, including the already-evaled fake frame scripts.
      await session.send('Debugger.enable', { maxScriptsCacheSize: 1 })

      await retry(async () => {
        expect(fakeScripts.length).toBeGreaterThan(0)
      })

      for (const script of fakeScripts) {
        expect(script.sourceMapURL).toMatch(
          /^https?:\/\/[^/]+\/__nextjs_source-map\?filename=/
        )
      }

      // Do what an attached debugger does with these scripts: fetch the
      // referenced source map and apply it to the frame's position. React
      // pads each fake function so that its `_()` call sits at the frame's
      // line/column in the underlying chunk, so mapping that position must
      // reveal the original callsite.
      const sourceMapsByURL = new Map<string, any>()
      const mappedSources: string[] = []
      for (const script of fakeScripts) {
        let sourceMap = sourceMapsByURL.get(script.sourceMapURL)
        if (sourceMap === undefined) {
          const response = await fetch(script.sourceMapURL)
          expect({
            url: script.sourceMapURL,
            status: response.status,
          }).toEqual({ url: script.sourceMapURL, status: 200 })
          sourceMap = await response.json()
          expect(sourceMap).toHaveProperty('version', 3)
          sourceMapsByURL.set(script.sourceMapURL, sourceMap)
        }

        const { scriptSource } = await session.send(
          'Debugger.getScriptSource',
          { scriptId: script.scriptId }
        )
        const callIndex = scriptSource.indexOf('_()')
        if (callIndex === -1) continue
        const line = scriptSource.slice(0, callIndex).split('\n').length
        const column =
          callIndex - (scriptSource.lastIndexOf('\n', callIndex) + 1)

        const consumer = new SyncSourceMapConsumer(sourceMap)
        const original = consumer.originalPositionFor({ line, column })
        if (original.source !== null) {
          mappedSources.push(original.source)
        }
      }

      // The rendered page's own Server Component frames must resolve to its
      // original source file, like clicking the frame in a debugger would.
      expect(
        mappedSources.filter((source) =>
          source.includes('rsc-error-log/page.js')
        )
      ).not.toEqual([])
    } finally {
      session.close()
    }
  })
})
