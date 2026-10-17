import { Readable } from 'node:stream'
import { getFlightStream } from 'next/dist/server/app-render/use-flight-response'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'
import type { WorkUnitStore } from 'next/dist/server/app-render/work-unit-async-storage.external'
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'
import type { WorkStore } from 'next/dist/server/app-render/work-async-storage.external'
import { setManifestsSingleton } from 'next/dist/server/app-render/manifests-singleton'

describe('getFlightStream workUnitAsyncStorage handling', () => {
  const mockWorkStore = {
    route: '/test',
  } as WorkStore

  beforeAll(() => {
    setManifestsSingleton({
      page: '/test',
      clientReferenceManifest: {
        clientModules: {},
        ssrModuleMapping: {},
        edgeSSRModuleMapping: {},
        rscModuleMapping: {},
        edgeRscModuleMapping: {},
      } as any,
      serverActionsManifest: {
        encryptionKey: 'test',
        node: {},
        edge: {},
      } as any,
    })
  })

  it('does not throw InvariantError when called outside an active work unit store (e.g. stream backpressure / abort unwind)', async () => {
    await workAsyncStorage.run(mockWorkStore, async () => {
      // Ensure workUnitAsyncStorage has no active store
      expect(workUnitAsyncStorage.getStore()).toBeUndefined()

      const stream = Readable.from(['0:{"test":"streamless"}\n'])
      const resultPromise = getFlightStream(
        stream,
        undefined,
        undefined,
        undefined
      )

      // Must return a Promise instead of throwing InvariantError E696
      expect(resultPromise).toBeInstanceOf(Promise)
      const result = await resultPromise
      expect(result).toBeDefined()
    })
  })

  it('correctly handles active work unit store without error', async () => {
    const fakeStore = {
      type: 'prerender',
      phase: 'render',
      implicitTags: {} as any,
    } as WorkUnitStore

    await workAsyncStorage.run(mockWorkStore, async () => {
      await workUnitAsyncStorage.run(fakeStore, async () => {
        const stream = Readable.from(['0:{"test":"in-store"}\n'])
        const resultPromise = getFlightStream(
          stream,
          undefined,
          undefined,
          undefined
        )
        expect(resultPromise).toBeInstanceOf(Promise)
        const result = await resultPromise
        expect(result).toBeDefined()
      })
    })
  })

  it('defers resolution to nextTick when workUnitStore is prerender-client or validation-client', async () => {
    const prerenderClientStore = {
      type: 'prerender-client',
      phase: 'render',
      implicitTags: {} as any,
    } as WorkUnitStore

    await workAsyncStorage.run(mockWorkStore, async () => {
      await workUnitAsyncStorage.run(prerenderClientStore, async () => {
        let nextTickRan = false
        process.nextTick(() => {
          nextTickRan = true
        })

        const stream = Readable.from(['0:{"test":"prerender-client"}\n'])
        const resultPromise = getFlightStream(
          stream,
          undefined,
          undefined,
          undefined
        )

        expect(resultPromise).toBeInstanceOf(Promise)
        const result = await resultPromise
        expect(result).toBeDefined()
        expect(nextTickRan).toBe(true)
      })
    })
  })
})
