import {
  createElement,
  Fragment,
  Suspense,
  memo,
  lazy,
  type ComponentType,
} from 'react'
import { createClientReferenceObserver } from 'next/dist/experimental/testing/rsc/client-references'
import { observeServerTree } from 'next/dist/experimental/testing/rsc/observe'

const runtime = globalThis as typeof globalThis & {
  __next_require__?: (id: string | number) => unknown
}

function manifest() {
  return {
    ssrModuleMapping: {
      'client-module': {
        '*': { id: 'ssr-module', name: '*', chunks: [] },
      },
    },
  } as unknown as Parameters<typeof createClientReferenceObserver>[0]
}

describe('decoded server observations', () => {
  const original = runtime.__next_require__
  let observer: ReturnType<typeof createClientReferenceObserver> | undefined

  afterEach(() => {
    observer?.dispose()
    observer = undefined
    runtime.__next_require__ = original
  })

  function load(namespace: unknown) {
    const require = jest.fn(() => namespace)
    runtime.__next_require__ = require
    observer = createClientReferenceObserver(manifest())
    return { require, result: runtime.__next_require__!('ssr-module') }
  }

  it('observes async server output and aliases without executing client UI', async () => {
    const Client = jest.fn(() => {
      throw new Error('client component must not run')
    })
    const namespace = { __esModule: true, default: Client, Alias: Client }
    const loaded = load(namespace)
    expect(loaded.result).toBe(namespace)
    const model = createElement(
      Fragment,
      null,
      'before',
      Promise.resolve(createElement('span', { id: 'nested' }, 'nested')),
      createElement(
        Suspense,
        { fallback: createElement('em', null, 'loading') },
        createElement(Client, { initial: 10 })
      )
    )
    const result = await observeServerTree(
      model,
      observer!,
      new AbortController().signal
    )
    expect(result.text).toBe('beforenested')
    expect(result.clientBoundaries).toEqual([
      {
        kind: 'client-boundary',
        references: [
          { moduleId: 'client-module', exportName: 'default' },
          { moduleId: 'client-module', exportName: 'Alias' },
        ],
        props: { initial: 10 },
      },
    ])
    expect(result.tree[0]).toMatchObject({
      kind: 'fragment',
      children: [
        { kind: 'text', value: 'before' },
        { kind: 'element', tag: 'span', props: { id: 'nested' } },
        { kind: 'suspense', fallback: [{ kind: 'element', tag: 'em' }] },
      ],
    })
    expect(Client).not.toHaveBeenCalled()
    expect(loaded.require).toHaveBeenCalledTimes(1)
  })

  it('preserves async module promises and cached wrapper identities', async () => {
    const Client = jest.fn(() => null)
    const Wrapper = memo(Client)
    const promise = Promise.resolve({ Wrapper })
    const loaded = load(promise)
    expect(loaded.result).toBe(promise)
    await promise
    for (let i = 0; i < 2; i++) {
      const result = await observeServerTree(
        createElement(Wrapper),
        observer!,
        new AbortController().signal
      )
      expect(result.clientBoundaries[0].references).toEqual([
        { moduleId: 'client-module', exportName: 'Wrapper' },
      ])
    }
    expect(loaded.require).toHaveBeenCalledTimes(1)
    expect(Client).not.toHaveBeenCalled()
  })

  it('does not invent identities for unresolved component types', async () => {
    load({})
    await expect(
      observeServerTree(
        createElement(() => null),
        observer!,
        new AbortController().signal
      )
    ).rejects.toThrow('no observed SSR manifest identity')
  })

  it('rejects a primitive client export indistinguishable from a host tag', async () => {
    load({ default: 'section' })
    await expect(
      observeServerTree(
        createElement('section', null, 'ambiguous'),
        observer!,
        new AbortController().signal
      )
    ).rejects.toThrow('indistinguishable from a host element')
  })

  it.each([Fragment, Suspense])(
    'rejects client exports indistinguishable from built-in types',
    async (type) => {
      load({ Client: type })
      await expect(
        observeServerTree(
          createElement(type, null, 'nested'),
          observer!,
          new AbortController().signal
        )
      ).rejects.toThrow('indistinguishable from')
    }
  )

  it.each(['client text', 10, 10n, NaN])(
    'rejects ambiguous client-export text %s',
    async (value) => {
      load({ Client: value })
      await expect(
        observeServerTree(value, observer!, new AbortController().signal)
      ).rejects.toThrow('indistinguishable from server text')
    }
  )

  it('resolves the actual lazy protocol without invoking the resolved client', async () => {
    const Client = jest.fn(() => null)
    load({ Client })
    const LazyReference = lazy(() => Promise.resolve({ default: Client }))
    const result = await observeServerTree(
      createElement(LazyReference),
      observer!,
      new AbortController().signal
    )
    expect(result.clientBoundaries[0].references).toEqual([
      { moduleId: 'client-module', exportName: 'Client' },
    ])
    expect(Client).not.toHaveBeenCalled()
  })

  it('stops at a known exported lazy wrapper without initializing it', async () => {
    const moduleLoader = jest.fn(async () => ({ default: () => null }))
    const Wrapper = lazy(moduleLoader)
    load({ Wrapper })
    const LazyReference = lazy(() => Promise.resolve({ default: Wrapper }))
    const result = await observeServerTree(
      createElement(LazyReference),
      observer!,
      new AbortController().signal
    )
    expect(result.clientBoundaries[0].references).toEqual([
      { moduleId: 'client-module', exportName: 'Wrapper' },
    ])
    expect(moduleLoader).not.toHaveBeenCalled()
  })

  it('rejects cyclic lazy types instead of looping', async () => {
    load({})
    const cyclic = {
      $$typeof: Symbol.for('react.lazy'),
      _payload: null,
      _init: () => cyclic,
    }
    await expect(
      observeServerTree(
        createElement(cyclic as unknown as ComponentType),
        observer!,
        new AbortController().signal
      )
    ).rejects.toThrow('cyclic decoded React lazy type')
  })

  it('aborts a pending lazy element type', async () => {
    load({})
    const controller = new AbortController()
    const LazyReference = lazy(() => new Promise(() => {}))
    const result = observeServerTree(
      createElement(LazyReference),
      observer!,
      controller.signal
    )
    const failure = new Error('lazy observation aborted')
    controller.abort(failure)
    await expect(result).rejects.toBe(failure)
  })

  it('propagates rejected decoded children', async () => {
    load({})
    const failure = new Error('nested decoded failure')
    await expect(
      observeServerTree(
        Promise.reject(failure),
        observer!,
        new AbortController().signal
      )
    ).rejects.toBe(failure)
  })

  it('aborts unresolved decoded work without waiting for the thenable', async () => {
    load({})
    const controller = new AbortController()
    const failure = new Error('attempt aborted')
    const result = observeServerTree(
      new Promise(() => {}),
      observer!,
      controller.signal
    )
    controller.abort(failure)
    await expect(result).rejects.toBe(failure)
  })

  it('observes module rejections without changing the returned promise', async () => {
    const failure = new Error('module rejected')
    const promise = Promise.reject(failure)
    const loaded = load(promise)
    expect(loaded.result).toBe(promise)
    await expect(loaded.result).rejects.toBe(failure)
    expect(observer!.referencesFor(() => null)).toEqual([])
  })

  it('restores the loader and stops accepting observations on disposal', () => {
    const loaded = load({})
    observer!.dispose()
    observer!.dispose()
    expect(runtime.__next_require__).toBe(loaded.require)
    expect(() => observer!.referencesFor(null)).toThrow('disposed')
  })
})
