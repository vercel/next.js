import { AsyncLocalStorage } from 'node:async_hooks'
import {
  createWorkUnitTracker,
  getPromiseAsyncId,
  rootTask,
  log,
  type WorkUnitTracker,
  getOriginWorkUnit,
} from './track-work-unit.external'
import {
  type WorkUnitStore,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'

async function setup<T>(
  onMismatch: Parameters<typeof createWorkUnitTracker>[0],
  cb: (tracker: WorkUnitTracker) => Promise<T>
): Promise<T> {
  const tracker = createWorkUnitTracker(onMismatch, getStoreId)
  tracker.hook.enable()
  try {
    return await rootTask(() => cb(tracker))
  } finally {
    tracker.hook.disable()
  }
}

type FakeWorkUnitStore = { type: string; __id: string }

function createMockStore(id: string): WorkUnitStore {
  const store: FakeWorkUnitStore = {
    type: 'request',
    __id: id,
  }
  return store as unknown as WorkUnitStore
}

function getStoreId(store: WorkUnitStore): string {
  // We always use a fake store in these tests
  return (store as unknown as FakeWorkUnitStore).__id
}

it('one', async () => {
  const onMismatch = jest.fn()
  const tracker = createWorkUnitTracker(onMismatch, getStoreId)
  tracker.hook.enable()
  try {
    await rootTask(async () => {
      log(`creating promise`)
      const p = Promise.resolve(2)
      log(`created promise: ${getPromiseAsyncId(p)}`)

      log(`=============================`)
      log(`creating derived promise`)
      const derived = p.then((x) => 2 * x)
      log(`created derived promise: ${getPromiseAsyncId(derived)}`)
      await derived

      log(`=============================`)
      log(`creating derived promise 2`)
      const derived2 = p.then((x) => 4 * x)
      log(`created derived promise 2: ${getPromiseAsyncId(derived2)}`)
      await derived2
    })
  } finally {
    tracker.hook.disable()
  }
})

it('successive 1', async () => {
  const onMismatch = jest.fn<void, [string, string]>()
  await setup(onMismatch, async (tracker) => {
    let cachedPromise: Promise<any>

    const initialStore = createMockStore('initial')
    await workUnitAsyncStorage.run(initialStore, async () => {
      log('[initial] creating cached promise')
      cachedPromise = Promise.resolve()
      log(
        `[initial] created cached promise ${getPromiseAsyncId(cachedPromise)}`
      )
      expect(getOriginWorkUnit(tracker, cachedPromise)).toBe(initialStore)
      const x = cachedPromise.then(() =>
        log('[initial] cached promise resolved')
      )
      expect(getOriginWorkUnit(tracker, x)).toBe(initialStore)
    })

    const finalStore = createMockStore('final')
    await workUnitAsyncStorage.run(finalStore, async () => {
      // wait for promise to be set
      await Promise.resolve()
      await Promise.resolve()
      log('-----------------------')

      log('[final] then-ing cached promise')
      expect(onMismatch).not.toHaveBeenCalled()
      const p = cachedPromise.then(() => {
        log("then'ed cached promise resolved")
      })
      log('[final] then-ed cached promise')
      expect(getOriginWorkUnit(tracker, p)).toBe(finalStore)
      expect(onMismatch).toHaveBeenNthCalledWith(1, 'initial', 'final')
      await p

      log('[final] awaiting cached promise')
      await cachedPromise
      expect(onMismatch).toHaveBeenNthCalledWith(2, 'initial', 'final')
    })
  })
})

it('successive 2', async () => {
  const onMismatch = jest.fn<void, [string, string]>()
  await setup(onMismatch, async (tracker) => {
    let cachedPromise: Promise<any>

    const initialStore = createMockStore('initial')
    await workUnitAsyncStorage.run(initialStore, async () => {
      log('[initial] creating cached promise')
      const trigger = Promise.resolve()
      // attempt to launder the promise
      cachedPromise = new Promise((resolve, reject) => {
        trigger.then(resolve, reject)
      })
      log(
        `[initial] created cached promise ${getPromiseAsyncId(cachedPromise)}`
      )
      expect(getOriginWorkUnit(tracker, cachedPromise)).toBe(initialStore)
      const x = cachedPromise.then(() =>
        log('[initial] cached promise resolved')
      )
      expect(getOriginWorkUnit(tracker, x)).toBe(initialStore)
    })

    const finalStore = createMockStore('final')
    await workUnitAsyncStorage.run(finalStore, async () => {
      // wait for promise to be set
      await Promise.resolve()
      await Promise.resolve()
      log('-----------------------')

      log('[final] then-ing cached promise')
      expect(onMismatch).not.toHaveBeenCalled()
      const p = cachedPromise.then(() => {
        log("then'ed cached promise resolved")
      })
      log('[final] then-ed cached promise')
      expect(getOriginWorkUnit(tracker, p)).toBe(finalStore)
      expect(onMismatch).toHaveBeenNthCalledWith(1, 'initial', 'final')
      await p

      log('[final] awaiting cached promise')
      await cachedPromise
      expect(onMismatch).toHaveBeenNthCalledWith(2, 'initial', 'final')
    })
  })
})

it('nested 1', async () => {
  const onMismatch = jest.fn<void, [string, string]>()
  await setup(onMismatch, async (tracker) => {
    let cachedPromise: Promise<any>

    const outerStore = createMockStore('outer')
    log(`[outer] running outer store`)
    const outerWorkUnitPromise = workUnitAsyncStorage.run(
      outerStore,
      async () => {
        log('[outer] creating cached promise')
        cachedPromise = Promise.resolve()
        log(
          `[outer] created cached promise ${getPromiseAsyncId(cachedPromise)}`
        )
        expect(getOriginWorkUnit(tracker, cachedPromise)).toBe(outerStore)

        log(`[outer] running inner store`)
        const innerStore = createMockStore('inner')
        const innerWorkUnitPromise = workUnitAsyncStorage.run(
          innerStore,
          async () => {
            log('-----------------------')

            log('[inner] then-ing cached promise')
            expect(onMismatch).not.toHaveBeenCalled()
            const p = cachedPromise.then(() => {
              log("then'ed cached promise resolved")
            })
            log('[inner] then-ed cached promise')
            expect(getOriginWorkUnit(tracker, p)).toBe(innerStore)
            expect(onMismatch).toHaveBeenNthCalledWith(1, 'outer', 'inner')
            await p

            log('[inner] awaiting cached promise')
            await cachedPromise
            expect(onMismatch).toHaveBeenNthCalledWith(2, 'outer', 'inner')
          }
        )
        log('inner store promise', getPromiseAsyncId(innerWorkUnitPromise))
        // TODO: fix this (should null)
        // expect(getOriginWorkUnit(tracker, innerWorkUnitPromise)).toBe(
        //   outerStore
        // )
        await innerWorkUnitPromise
      }
    )
    log('outer store promise', getPromiseAsyncId(outerWorkUnitPromise))
    // TODO: fix this (should null)
    // expect(getOriginWorkUnit(tracker, outerWorkUnitPromise)).toBe(null)
    await outerWorkUnitPromise
  })
})

it('one store', async () => {
  const onMismatch = jest.fn<void, [string, string]>()
  await setup(onMismatch, async (tracker) => {
    log(`running store`)
    const store = createMockStore('one')
    const workUnitPromise = workUnitAsyncStorage.run(store, async () => {
      log('[one] creating promise')
      const promise = Promise.resolve()
      log(`[one] created promise ${getPromiseAsyncId(promise)}`)
      expect(getOriginWorkUnit(tracker, promise)).toBe(store)

      await promise

      await (async () => {
        const anotherPromise = (async () => {})()
        expect(getOriginWorkUnit(tracker, anotherPromise)).toBe(store)
      })()
    })
    log(`store promise ${getPromiseAsyncId(workUnitPromise)}`)
    expect(getOriginWorkUnit(tracker, workUnitPromise)).toBe(null)
    await workUnitPromise

    expect(getOriginWorkUnit(tracker, Promise.resolve())).toBe(null)
  })
})

it('one store, sync run', async () => {
  const onMismatch = jest.fn<void, [string, string]>()
  await setup(onMismatch, async (tracker) => {
    log(`running store`)
    const store = createMockStore('one')
    const promises = workUnitAsyncStorage.run(store, () => {
      const promise1 = Promise.resolve()
      expect(getOriginWorkUnit(tracker, promise1)).toBe(store)
      const promise2 = Promise.resolve()
      expect(getOriginWorkUnit(tracker, promise2)).toBe(store)
      return [promise1, promise2]
    })
    expect(getOriginWorkUnit(tracker, Promise.resolve())).toBe(null)
    await Promise.all(promises)
    expect(onMismatch).not.toHaveBeenCalled()
  })
})

it('async snapshot', async () => {
  const onMismatch = jest.fn<void, [string, string]>()
  await setup(onMismatch, async (tracker) => {
    log(`running store`)
    const store = createMockStore('one')
    const runInStore = workUnitAsyncStorage.run(store, () =>
      AsyncLocalStorage.snapshot()
    )

    const workUnitPromise = runInStore(async () => {
      const promise = Promise.resolve()
      log(`[one] created promise ${getPromiseAsyncId(promise)}`)
      expect(getOriginWorkUnit(tracker, promise)).toBe(store)
    })
    log(`store promise ${getPromiseAsyncId(workUnitPromise)}`)

    // TODO: `AsyncLocalStorage#run()` returns a promise where the store is set,
    // so this will give us the store, not null.
    // expect(getOriginWorkUnit(tracker, storePromise)).toBe(null)
    await workUnitPromise

    // Going from no store to a store is not a mismatch.
    // We need to be able to await a promise returned from `AsyncLocalStorage#run()`.
    expect(onMismatch).not.toHaveBeenCalled()

    // We're outside the run() call, so there shouldn't be a store here.
    expect(getOriginWorkUnit(tracker, Promise.resolve())).toBe(null)

    // still no calls here.
    expect(onMismatch).not.toHaveBeenCalled()
  })
})

it('new promise', async () => {
  const onMismatch = jest.fn<void, [string, string]>()
  await setup(onMismatch, async () => {
    const original = Promise.reject(4)
    log(`original promise: ${getPromiseAsyncId(original)}`)

    const another = Promise.resolve(10)
    log(`another promise: ${getPromiseAsyncId(another)}`)

    const derived = new Promise((resolve, reject) => {
      // const x = original.then(resolve, reject)
      const x = original.then(
        () => {
          another.then(resolve, reject)
        },
        () => {
          another.then(resolve, reject)
        }
      )
      log(`intermediate promise: ${getPromiseAsyncId(x)}`)
    })
    log(`derived promise: ${getPromiseAsyncId(derived)}`)
    await derived
  })
})

// await rootTask(async () => {
//   let cachedPromise: Promise<any>;
//   await Promise.all([
//     workUnitAsyncStorage.run({ id: "initial" }, async () => {
//       log("[initial] creating cached promise");
//       cachedPromise = new Promise((resolve) => setTimeout(resolve));
//     }),
//     workUnitAsyncStorage.run({ id: "final" }, async () => {
//       log("-----------------------");
//       log("[final] awaiting cached promise");
//       const result = await cachedPromise;
//     }),
//   ]);
// });

// const p = Promise.resolve(2);
// log(`created promise: ${getPromiseAsyncId(p)}`);
// const derived = p.then((x) => 2 * x);
// log(`created derived promise: ${getPromiseAsyncId(derived)}`);
// await derived;
// log("------------------------");
// log("creating timeout promise");
// const tp = new Promise<void>((resolve) => {
//   log("creating timeout");
//   setTimeout(() => {
//     log(
//       `timeout fired, resolving timeout promise ${getPromiseAsyncId(tp)}`,
//     );
//     resolve();
//   });
// });
// log(`created timeout promise ${getPromiseAsyncId(tp)}`);
// log(`awaiting timeout promise ${getPromiseAsyncId(tp)}`);
// await tp;
