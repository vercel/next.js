/** @jest-environment jsdom */

import { readFileSync } from 'fs'
import { join } from 'path'
import { runInNewContext } from 'vm'
import ts from 'typescript'
import { handleTurbopackHmrSubscription } from 'next/dist/server/dev/turbopack-hmr-subscription'
import { TurbopackHmr } from 'next/dist/client/dev/hot-reloader/turbopack-hot-reloader-common'
import { HMR_MESSAGE_SENT_TO_BROWSER } from 'next/dist/server/dev/hot-reloader-types'
import type { TurbopackResult, Update } from 'next/dist/build/swc/types'
import {
  connect,
  setHooks,
  type WebSocketMessage,
} from '../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/dev/hmr-client/hmr-client'

const runtimeRoot = join(
  __dirname,
  '../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime'
)
// Execute the actual concatenated runtime source, not a copy of its algorithm.
const runtimeSource = ['base/dev-base.ts', 'dom/dev-backend-dom.ts']
  .map(
    (file) =>
      ts.transpileModule(readFileSync(join(runtimeRoot, file), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
      }).outputText
  )
  .join('\n')

const cssUrl = '/_next/static/chunks/layout.css'
const cssPath = 'static/chunks/layout.css'

function stylesheet(href = cssUrl) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.crossOrigin = 'anonymous'
  link.href = href
  document.head.appendChild(link)
  return link
}

function links() {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link'))
}

function loaded(link: HTMLLinkElement) {
  link.dispatchEvent(new Event('load'))
}

type Runtime = {
  backend: {
    reloadChunk: (url: string) => Promise<void>
    reconcileChunk: (url: string) => Promise<void>
    unloadChunk: (url: string) => void
  }
  apply: (path: string, message: ServerMessage) => void
  register: (list: { script: string; chunks: string[]; source: string }) => void
}

function runtime(userAgent = 'Chrome', readyOnRegister = false): Runtime {
  return runInNewContext(
    `${runtimeSource}\n;({ backend: DEV_BACKEND, apply: handleApply, register: registerChunkList })`,
    {
      Context: class {},
      devModuleCache: new Map(),
      runtimeModules: new Set(),
      createModuleWithDirectionFlag: false,
      document,
      MutationObserver,
      navigator: { userAgent },
      location: { origin: 'http://localhost:3000' },
      self: { location: { reload: jest.fn() } },
      URL,
      console,
      CROSS_ORIGIN: 'anonymous',
      chunkResolvers: new Map(),
      isCss: (url: string) => /\.css(?:\?|$)/.test(url),
      isJs: (url: string) => /\.js(?:\?|$)/.test(url),
      getChunkRelativeUrl: (path: string) => `/_next/${path}`,
      getChunkFromRegistration: (path: string) => path,
      getPathFromScript: (path: string) => path,
      getChunkPath: (path: string) => path,
      BACKEND: { registerChunk: jest.fn() },
      CHUNK_UPDATE_LISTENERS: {
        push: ([path, callback]: [
          string,
          (message: ServerMessage) => void,
        ]) => {
          if (readyOnRegister) callback(ready(path))
        },
      },
    }
  )
}

function ready(path = 'entry.js'): ServerMessage {
  return { type: 'subscribed', resource: { path }, issues: [] }
}

beforeEach(() => {
  document.head.innerHTML = ''
})

describe('CSS reconciliation', () => {
  it('preserves the React-owned stylesheet node and precedence metadata', async () => {
    const original = stylesheet()
    original.dataset.precedence = 'next'
    original.dataset.href = cssUrl
    original.id = 'react-stylesheet'
    original.nonce = 'test-nonce'
    original.crossOrigin = 'use-credentials'
    const onload = jest.fn()
    original.addEventListener('load', onload)
    const tail = stylesheet('/_next/tail.css')
    tail.dataset.precedence = 'other'
    const { backend } = runtime()
    const initial = backend.reconcileChunk(cssUrl)
    const replacement = links()[1]
    expect(replacement.hasAttribute('data-precedence')).toBe(false)
    expect(replacement.hasAttribute('data-href')).toBe(false)
    expect(replacement.getAttribute('href')).not.toBe(
      original.getAttribute('href')
    )
    expect(replacement.id).toBe('')
    expect(replacement.nonce).toBe('test-nonce')
    expect(replacement.crossOrigin).toBe('use-credentials')
    expect(Array.from(document.querySelectorAll('[data-precedence]'))).toEqual([
      original,
      tail,
    ])
    loaded(replacement)
    expect(original.href).toBe(replacement.href)
    loaded(original)
    await initial
    expect(onload).toHaveBeenCalledTimes(1)
    // React's resource.instance and cached precedence anchors refer to this
    // exact node, not merely any link with the same href.
    expect(original.isConnected).toBe(true)
    expect(links()).toEqual([original, tail])
    expect(original.dataset.precedence).toBe('next')
    expect(original.dataset.href).toBe(cssUrl)
  })
  it('refreshes shared active CSS once, after registration, without repeated readiness work', () => {
    const original = stylesheet()
    const clone = jest.spyOn(original, 'cloneNode')
    const { register, apply } = runtime('Chrome', true)
    register({
      script: 'a.js',
      chunks: [cssPath, 'client.js'],
      source: 'entry',
    })
    register({ script: 'b.js', chunks: [cssPath], source: 'dynamic' })
    expect(clone).toHaveBeenCalledTimes(1)
    expect(links()).toHaveLength(2)
    loaded(links()[1])
    loaded(original)
    expect(original.isConnected).toBe(true)
    apply('a.js', ready('a.js'))
    apply('b.js', ready('b.js'))
    expect(clone).toHaveBeenCalledTimes(1)
    expect(links()).toHaveLength(1)
    clone.mockRestore()
  })

  it('skips inactive CSS but keeps ordinary HMR re-linking', async () => {
    const { backend } = runtime()
    await backend.reconcileChunk(cssUrl)
    expect(links()).toHaveLength(0)
    const update = backend.reloadChunk(cssUrl)
    expect(links()).toHaveLength(1)
    loaded(links()[0])
    await update
    expect(links()).toHaveLength(1)
  })

  it('does not leave initial CSS active if the original was removed while loading', async () => {
    const original = stylesheet()
    const { backend } = runtime()
    const initial = backend.reconcileChunk(cssUrl)
    const replacement = links()[1]
    original.remove()
    loaded(replacement)
    await initial
    expect(links()).toHaveLength(0)
  })

  it('rechecks lifecycle state when queued initial work starts', async () => {
    stylesheet()
    const { backend } = runtime()
    const update = backend.reloadChunk(cssUrl)
    const initial = backend.reconcileChunk(cssUrl)
    backend.unloadChunk(cssUrl)
    await Promise.all([update, initial])
    expect(links()).toHaveLength(0)
  })

  it('serializes a later edit behind initial CSS and leaves only the newest link', async () => {
    const original = stylesheet()
    const tail = stylesheet('/_next/tail.css')
    const { backend } = runtime()
    const initial = backend.reconcileChunk(cssUrl)
    const first = links()[1]
    const later = backend.reloadChunk(cssUrl)
    // The second request cannot race the first response, or orphan its link.
    expect(links()).toEqual([original, first, tail])
    loaded(first)
    // Adoption is still in flight, so the later edit must not start yet.
    expect(links()).toEqual([original, first, tail])
    loaded(original)
    await initial
    await Promise.resolve() // Start the queued continuation, not a timing sleep.
    const latest = links()[1]
    expect(latest).not.toBe(first)
    expect(links()).toEqual([original, latest, tail])
    loaded(latest)
    loaded(original)
    await later
    expect(links()).toEqual([original, tail])
  })

  it('cleans up a failed replacement and allows a queued newer edit to recover', async () => {
    const original = stylesheet()
    const { backend } = runtime()
    const initial = backend.reconcileChunk(cssUrl)
    const rejection = initial.catch((error) => error)
    const later = backend.reloadChunk(cssUrl)
    links()[1].dispatchEvent(new Event('error'))
    expect(await rejection).toMatchObject({
      message: expect.stringContaining('Failed to load CSS chunk'),
    })
    await Promise.resolve()
    expect(links()[0]).toBe(original)
    expect(links()).toHaveLength(2)
    const latest = links()[1]
    loaded(latest)
    loaded(original)
    await later
    expect(links()).toEqual([original])
  })

  it('keeps a loaded fallback after adoption fails and recovers on a later edit', async () => {
    const original = stylesheet()
    original.dataset.precedence = 'next'
    const { backend } = runtime()
    const initial = backend.reconcileChunk(cssUrl)
    const rejection = initial.catch((error) => error)
    const fallback = links()[1]
    loaded(fallback)
    original.dispatchEvent(new Event('error'))
    expect(await rejection).toMatchObject({
      message: expect.stringContaining('Failed to adopt CSS chunk'),
    })
    expect(links()).toEqual([original, fallback])
    const later = backend.reloadChunk(cssUrl)
    const latest = links()[1]
    expect(links()).toEqual([original, latest, fallback])
    loaded(latest)
    loaded(original)
    await later
    expect(links()).toEqual([original])
    expect(original.dataset.precedence).toBe('next')
  })

  it('cancels adoption on unload and does not leave queued initial work active', async () => {
    const original = stylesheet()
    const { backend } = runtime()
    const update = backend.reloadChunk(cssUrl)
    const initial = backend.reconcileChunk(cssUrl)
    loaded(links()[1])
    backend.unloadChunk(cssUrl)
    await Promise.all([update, initial])
    loaded(original)
    expect(links()).toHaveLength(0)
  })

  it('cleans up initial adoption when the original is detached without an event', async () => {
    const original = stylesheet()
    const { backend } = runtime()
    const initial = backend.reconcileChunk(cssUrl)
    loaded(links()[1])
    original.remove()
    // A detached link need not emit load/error: the DOM observer completes it.
    await initial
    expect(links()).toHaveLength(0)
    const later = backend.reloadChunk(cssUrl)
    expect(links()).toHaveLength(1)
    loaded(links()[0])
    await later
    expect(links()).toHaveLength(1)
  })

  it('keeps ordinary HMR re-linking when the original detaches during adoption', async () => {
    const original = stylesheet()
    const { backend } = runtime()
    const update = backend.reloadChunk(cssUrl)
    const replacement = links()[1]
    loaded(replacement)
    original.remove()
    await update
    expect(links()).toEqual([replacement])
  })

  it('reports an initial load failure without an unhandled rejection', async () => {
    stylesheet()
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { register } = runtime('Chrome', true)
    register({ script: 'entry.js', chunks: [cssPath], source: 'entry' })
    links()[1].dispatchEvent(new Event('error'))
    await Promise.resolve()
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to reconcile CSS chunk'),
      expect.objectContaining({ message: expect.stringContaining(cssUrl) })
    )
    expect(links()).toHaveLength(1)
    error.mockRestore()
  })

  it.each(['https://cdn.example/base/', '//cdn.example/base/'])(
    'preserves asset prefix %s during initial and ordinary CSS refresh',
    async (prefix) => {
      const url = `${prefix}layout.css?asset=one`
      const original = stylesheet(url)
      const { backend } = runtime()
      const initial = backend.reconcileChunk(url)
      const replacement = links()[1]
      expect(replacement.getAttribute('href')!.startsWith(`${url}&ts=`)).toBe(
        true
      )
      loaded(replacement)
      expect(original.getAttribute('href')).toBe(
        replacement.getAttribute('href')
      )
      loaded(original)
      await initial
      const later = backend.reloadChunk(url)
      const latest = links()[1]
      expect(latest.getAttribute('href')!.startsWith(`${url}&ts=`)).toBe(true)
      loaded(latest)
      loaded(original)
      await later
      expect(links()).toEqual([original])
      backend.unloadChunk(url)
      expect(links()).toHaveLength(0)
    }
  )

  it.each(['Firefox', 'Safari', 'Chrome'])(
    'preserves encoded URLs, parameters and cascade order in %s',
    async (userAgent) => {
      const url = '/base/static/chunks/a%20b.css?asset=one&ts=old'
      const original = stylesheet(
        '/base/static/chunks/a b.css?asset=one&ts=old'
      )
      const tail = stylesheet('/base/tail.css')
      const { backend } = runtime(userAgent)
      const initial = backend.reconcileChunk(url)
      const replacement = links()[1]
      expect(links()).toEqual([original, replacement, tail])
      expect(replacement.crossOrigin).toBe('anonymous')
      const refreshedUrl = new URL(replacement.href)
      expect(refreshedUrl.pathname).toBe('/base/static/chunks/a%20b.css')
      expect(refreshedUrl.searchParams.get('asset')).toBe('one')
      expect(refreshedUrl.searchParams.get('ts')).not.toBe('old')
      await backend.reconcileChunk('/base/static/chunks/a b.css?asset=two')
      expect(links()).toHaveLength(3)
      loaded(replacement)
      expect(original.href).toBe(replacement.href)
      loaded(original)
      await initial
      expect(links()).toEqual([original, tail])
    }
  )
})

function result(type: Update['type'] = 'issues'): TurbopackResult<Update> {
  const base = {
    resource: { path: 'entry.js', headers: null },
    issues: [],
    diagnostics: [],
  }
  const value: Update =
    type === 'issues'
      ? { ...base, type }
      : { ...base, type, instruction: { type: 'ChunkListUpdate', merged: [] } }
  return { value, issues: [] }
}

describe('subscription baseline readiness', () => {
  it('waits for the first result and preserves first/subsequent update ordering', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    async function* stream() {
      await gate
      yield result('partial')
      yield result()
    }
    const work = handleTurbopackHmrSubscription(
      stream(),
      () => true,
      (update) => calls.push(update.value.type),
      () => calls.push('subscribed')
    )
    expect(calls).toEqual([])
    release()
    await work
    expect(calls).toEqual(['partial', 'subscribed', 'issues'])
  })

  it('does not claim readiness for closed, failed, inactive or not-found streams', async () => {
    const ready = jest.fn()
    const update = jest.fn()
    async function* closed() {}
    await handleTurbopackHmrSubscription(closed(), () => true, update, ready)
    async function* failed() {
      yield await Promise.reject(new Error('subscription failed'))
    }
    await expect(
      handleTurbopackHmrSubscription(failed(), () => true, update, ready)
    ).rejects.toThrow('subscription failed')
    async function* inactive() {
      yield result()
    }
    await handleTurbopackHmrSubscription(inactive(), () => false, update, ready)
    async function* notFound() {
      // The native TS union currently omits this browser-protocol response.
      yield {
        ...result(),
        value: { ...result().value, type: 'notFound' },
      } as unknown as TurbopackResult<Update>
    }
    await handleTurbopackHmrSubscription(notFound(), () => true, update, ready)
    expect(ready).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not announce readiness if processing the first result fails or closes the subscription', async () => {
    const ready = jest.fn()
    async function* stream() {
      yield result()
    }
    await expect(
      handleTurbopackHmrSubscription(
        stream(),
        () => true,
        () => {
          throw new Error('processing failed')
        },
        ready
      )
    ).rejects.toThrow('processing failed')
    let active = true
    await handleTurbopackHmrSubscription(
      stream(),
      () => active,
      () => {
        active = false
      },
      ready
    )
    expect(ready).not.toHaveBeenCalled()
  })
})

it('readiness invokes callbacks without clearing issues or calling refresh hooks', () => {
  let receive!: (message: WebSocketMessage) => void
  const callback = jest.fn()
  const hooks = {
    beforeRefresh: jest.fn(),
    refresh: jest.fn(),
    buildOk: jest.fn(),
    issues: jest.fn(),
  }
  setHooks(hooks)
  ;(globalThis as any).__CSS_TEST_LISTENERS = [['entry.js', callback]]
  connect({
    addMessageListener: (listener) => {
      receive = listener
    },
    sendMessage: jest.fn(),
    onUpdateError: jest.fn(),
    chunkUpdateListenersGlobal: '__CSS_TEST_LISTENERS',
  })
  receive({ type: 'turbopack-message', data: ready(), hmrVersion: '0' })
  expect(callback).toHaveBeenCalledWith(ready())
  for (const hook of Object.values(hooks)) expect(hook).not.toHaveBeenCalled()
  delete (globalThis as any).__CSS_TEST_LISTENERS
})

it('readiness does not count as a Next.js Fast Refresh update', () => {
  const hmr = new TurbopackHmr()
  hmr.onBuilding()
  hmr.onTurbopackMessage({
    type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
    data: [{ type: 'subscribed', resource: { path: 'entry.js' }, issues: [] }],
    hmrVersion: '0',
  })
  expect(hmr.onBuilt()).toBeNull()
})
