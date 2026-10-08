import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page, Request } from 'playwright/test'
import { withMeasuredPage } from '../../../evals/lib/bundle-optimizer/browser-js'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function measuredBrowser() {
  const page = Object.assign(new EventEmitter(), {
    goto: jest.fn(async () => ({ ok: () => true })),
  })
  const close = jest.fn()
  const context = {
    newPage: async () => page as unknown as Page,
    newCDPSession: async () => ({ send: async () => {} }),
    close,
  }
  const browser = { newContext: async () => context } as unknown as Browser
  return { browser, page, close }
}

function script(url: string, body = 'void 0') {
  const finished = deferred<null>()
  const decoded = deferred<Buffer>()
  const request = {
    resourceType: () => 'script',
    url: () => url,
    sizes: async () => ({ responseBodySize: 10 }),
  } as unknown as Request
  const response = {
    request: () => request,
    url: () => url,
    headers: () => ({ 'content-type': 'application/javascript' }),
    ok: () => true,
    finished: () => finished.promise,
    body: () => decoded.promise,
  }
  return { request, response, finished, decoded, body }
}

describe('browser JavaScript snapshots', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('waits for headers, bodies, and scripts requested by a loader', async () => {
    const { browser, page, close } = measuredBrowser()
    const loader = script('http://app/loader.js')
    const editor = script('http://app/editor.js', 'cm-content')
    let settled = false
    const ready = deferred<void>()
    const result = withMeasuredPage(
      browser,
      'http://app',
      async (_, snapshot) => {
        page.emit('request', loader.request)
        ready.resolve()
        const summary = await snapshot()
        settled = true
        return summary
      },
      (body) => ({ editor: body.includes('cm-content') })
    )
    await ready.promise
    await jest.advanceTimersByTimeAsync(1000)
    expect(settled).toBe(false)

    page.emit('response', loader.response)
    loader.finished.resolve(null)
    page.emit('requestfinished', loader.request)
    await jest.advanceTimersByTimeAsync(1000)
    expect(settled).toBe(false)

    page.emit('request', editor.request)
    loader.decoded.resolve(Buffer.from(loader.body))
    await jest.advanceTimersByTimeAsync(1000)
    expect(settled).toBe(false)

    page.emit('response', editor.response)
    editor.finished.resolve(null)
    editor.decoded.resolve(Buffer.from(editor.body))
    page.emit('requestfinished', editor.request)
    await jest.advanceTimersByTimeAsync(2000)
    expect(await result).toMatchObject({
      encodedBytes: 20,
      requests: [
        { url: 'http://app/loader.js' },
        { url: 'http://app/editor.js', editor: true },
      ],
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('reports failed requests and closes the context', async () => {
    const { browser, page, close } = measuredBrowser()
    const failed = script('http://app/broken.js')
    const ready = deferred<void>()
    const result = withMeasuredPage(
      browser,
      'http://app',
      async (_, snapshot) => {
        page.emit('request', failed.request)
        page.emit('requestfailed', failed.request)
        ready.resolve()
        return snapshot()
      }
    )
    const rejected = result.catch((error) => error)
    await ready.promise
    await jest.advanceTimersByTimeAsync(2000)
    await expect(rejected).resolves.toMatchObject({
      message: expect.stringContaining('http://app/broken.js'),
    })
    expect(close).toHaveBeenCalledTimes(1)
  })
})

it('withholds grader directories and rejects leaked resources before the agent runs', () => {
  const sdk = dirname(require.resolve('@vercel/agent-eval/package.json'))
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import assert from 'node:assert/strict'
    import { splitTestFiles, verifyNoTestFiles } from ${JSON.stringify(pathToFileURL(join(sdk, 'dist/lib/sandbox.js')).href)}
    const files = ['app/page.tsx', 'EVAL.ts', '__eval__/measure.ts', '__eval__/nested/helper.ts', 'app/__eval__/helper.ts', 'app/__eval__-visible.ts'].map(path => ({ path, content: Buffer.from('') }))
    const { workspaceFiles, testFiles } = splitTestFiles(files)
    assert.deepEqual(workspaceFiles.map(file => file.path), ['app/page.tsx', 'app/__eval__-visible.ts'])
    assert.equal(testFiles.length, 4)
    await assert.rejects(verifyNoTestFiles({ runShell: async () => ({ stdout: './__eval__', exitCode: 0 }) }), /Test files found/)
  `,
    ],
    { encoding: 'utf8' }
  )
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
})

it('restores trusted graders and scopes browser measurement hooks to configured fixtures', () => {
  const result = spawnSync(
    process.execPath,
    [join(__dirname, 'sdk-lifecycle.cjs')],
    {
      cwd: join(__dirname, '../../..'),
      encoding: 'utf8',
    }
  )
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
})
