import 'next/dist/server/node-environment-baseline'
import { renderWithRequestLifecycle } from 'next/dist/experimental/testing/rsc/render-request'
import { createRequestLifecycle } from 'next/dist/experimental/testing/request/request-lifecycle'
import { runWithRenderRequest } from 'next/dist/experimental/testing/request/request-context'
import { after } from 'next/dist/server/after/after'
import type { ServerComponentRenderOutcome } from 'next/dist/experimental/testing/rsc/render'

function setup() {
  const lifecycle = createRequestLifecycle()
  const cleanups: Array<() => Promise<void>> = []
  const attempt = {
    onCleanup: (cleanup: () => Promise<void>) => cleanups.push(cleanup),
  }
  function run<T>(callback: () => T): T {
    return runWithRenderRequest(
      {
        headers: {},
        url: { pathname: '/', search: '' },
        onUpdateCookies: undefined,
        rootParams: {},
        implicitTags: { tags: [], expirationsByCacheKind: new Map() },
        resumeDataCache: null,
        previewProps: undefined,
        isHmrRefresh: false,
        serverComponentsHmrCache: undefined,
        hmrRefreshHash: undefined,
        fallbackParams: null,
      },
      {
        page: '/page',
        buildId: 'test-build',
        deploymentId: '',
        previouslyRevalidatedTags: [],
        renderOpts: {
          cacheLifeProfiles: {
            default: { stale: 300, revalidate: 900, expire: 3600 },
          },
          staticPageGenerationTimeout: 60,
          cacheComponents: false,
          validationLevel: 'warning',
          experimental: {
            authInterrupts: false,
            useCacheTimeout: 50,
            durableUseCacheEntries: false,
          },
          isBuildTimePrerendering: false,
          isDraftMode: false,
          assetPrefix: '',
          ...lifecycle.renderOpts,
        },
      },
      callback
    )
  }
  return { lifecycle, attempt, cleanups, run }
}

// The request/after machinery here is real. The controlled transport isolates
// its composition; the compiler/Flight integration is a separate acceptance gate.
it('waits for real nested after work before completing the request', async () => {
  const fixture = setup()
  let complete!: (outcome: ServerComponentRenderOutcome) => void
  const completed = new Promise<ServerComponentRenderOutcome>((resolve) => {
    complete = resolve
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const afterStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  let nestedFinished = false
  const request = renderWithRequestLifecycle(
    fixture.attempt,
    fixture.lifecycle,
    () =>
      fixture.run(() => {
        after(async () => {
          started()
          await gate
          after(() => {
            nestedFinished = true
          })
        })
        return {
          stream: new ReadableStream<Uint8Array>(),
          completed,
          dispose: async () => {},
        }
      })
  )
  let finished = false
  void request.completed.then(() => {
    finished = true
  })
  complete({ status: 'completed', errors: [] })
  await afterStarted
  expect(finished).toBe(false)
  release()
  await request.completed
  expect(nestedFinished).toBe(true)
  await fixture.cleanups[0]()
})

it('drains real after work when the renderer throws synchronously', async () => {
  const fixture = setup()
  let drained = false
  expect(() =>
    renderWithRequestLifecycle(fixture.attempt, fixture.lifecycle, () =>
      fixture.run(() => {
        after(() => {
          drained = true
        })
        throw new Error('render failed')
      })
    )
  ).toThrow('render failed')
  expect(drained).toBe(false)
  await fixture.cleanups[0]()
  expect(drained).toBe(true)
})

it('reports real after failures at cleanup while draining other callbacks', async () => {
  const fixture = setup()
  const failure = new Error('after task failed')
  const logged = jest.spyOn(console, 'error').mockImplementation(() => {})
  let drained = false
  try {
    renderWithRequestLifecycle(fixture.attempt, fixture.lifecycle, () =>
      fixture.run(() => {
        after(() => {
          throw failure
        })
        after(() => {
          drained = true
        })
        return {
          stream: new ReadableStream<Uint8Array>(),
          completed: Promise.resolve({
            status: 'completed' as const,
            errors: [],
          }),
          dispose: async () => {},
        }
      })
    )
    await expect(fixture.cleanups[0]()).rejects.toMatchObject({
      errors: [failure],
    })
    expect(drained).toBe(true)
  } finally {
    logged.mockRestore()
  }
})
