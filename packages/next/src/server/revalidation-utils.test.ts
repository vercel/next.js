import { executeRevalidates } from './revalidation-utils'
import { getCacheHandlers } from './use-cache/handlers'

jest.mock('./use-cache/handlers', () => ({
  getCacheHandlers: jest.fn(),
}))

const waitForRevalidates = async (
  maybeRevalidatesPromise: false | Promise<void>
) => {
  if (maybeRevalidatesPromise !== false) {
    await maybeRevalidatesPromise
  }
}

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

describe('executeRevalidates', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('does not execute the same tag revalidation twice for one work store', async () => {
    const updateTags = jest.fn(() => Promise.resolve())
    const revalidateTag = jest.fn(() => Promise.resolve())
    ;(getCacheHandlers as jest.Mock).mockReturnValue([{ updateTags }])

    const workStore = {
      pendingRevalidatedTags: [{ tag: 'a', profile: undefined }],
      pendingRevalidates: {},
      pendingRevalidateWrites: [],
      incrementalCache: { revalidateTag },
    } as any

    await waitForRevalidates(executeRevalidates(workStore))
    await waitForRevalidates(executeRevalidates(workStore))

    expect(updateTags).toHaveBeenCalledTimes(1)
    expect(updateTags).toHaveBeenCalledWith(['a'])
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith(['a'], undefined)
  })

  it('tracks executed tag revalidations on the work store', async () => {
    const updateTags = jest.fn(() => Promise.resolve())
    const revalidateTag = jest.fn(() => Promise.resolve())
    ;(getCacheHandlers as jest.Mock).mockReturnValue([{ updateTags }])

    const workStore = {
      pendingRevalidatedTags: [{ tag: 'a', profile: undefined }],
      pendingRevalidates: {},
      pendingRevalidateWrites: [],
      incrementalCache: { revalidateTag },
    } as any

    await waitForRevalidates(executeRevalidates(workStore))

    const executedRevalidatedTagsSymbol = Object.getOwnPropertySymbols(
      workStore
    ).find((symbol) => {
      return Symbol.keyFor(symbol) === '@next/executed-revalidated-tags'
    })

    expect(executedRevalidatedTagsSymbol).toBeDefined()
    expect(workStore[executedRevalidatedTagsSymbol!]).toEqual([
      { tag: 'a', profile: undefined },
    ])
  })

  it('executes revalidations added after a previous execution', async () => {
    const updateTags = jest.fn(() => Promise.resolve())
    const revalidateTag = jest.fn(() => Promise.resolve())
    ;(getCacheHandlers as jest.Mock).mockReturnValue([{ updateTags }])

    const workStore = {
      pendingRevalidatedTags: [{ tag: 'a', profile: undefined }],
      pendingRevalidates: {},
      pendingRevalidateWrites: [],
      incrementalCache: { revalidateTag },
    } as any

    await waitForRevalidates(executeRevalidates(workStore))

    workStore.pendingRevalidatedTags.push({
      tag: 'b',
      profile: undefined,
    })

    await waitForRevalidates(executeRevalidates(workStore))

    expect(updateTags).toHaveBeenCalledTimes(2)
    expect(updateTags).toHaveBeenNthCalledWith(1, ['a'])
    expect(updateTags).toHaveBeenNthCalledWith(2, ['b'])
    expect(revalidateTag).toHaveBeenCalledTimes(2)
    expect(revalidateTag).toHaveBeenNthCalledWith(1, ['a'], undefined)
    expect(revalidateTag).toHaveBeenNthCalledWith(2, ['b'], undefined)
  })

  it('still waits for pending revalidates with previously seen keys', async () => {
    const workStore = {
      pendingRevalidatedTags: [],
      pendingRevalidates: {
        'cache-set-a': Promise.resolve(),
      },
      pendingRevalidateWrites: [],
    } as any

    await waitForRevalidates(executeRevalidates(workStore))

    const deferred = createDeferred()
    workStore.pendingRevalidates = {
      'cache-set-a': deferred.promise,
    }

    const pendingRevalidates = waitForRevalidates(executeRevalidates(workStore))
    let resolved = false
    pendingRevalidates.then(() => {
      resolved = true
    })

    await Promise.resolve()

    expect(resolved).toBe(false)

    deferred.resolve()
    await pendingRevalidates

    expect(resolved).toBe(true)
  })

  it('does not treat a failed tag revalidation as executed', async () => {
    const failedUpdate = new Error('failed update')
    const updateTags = jest
      .fn()
      .mockRejectedValueOnce(failedUpdate)
      .mockResolvedValueOnce(undefined)
    const revalidateTag = jest.fn(() => Promise.resolve())
    ;(getCacheHandlers as jest.Mock).mockReturnValue([{ updateTags }])

    const workStore = {
      pendingRevalidatedTags: [{ tag: 'a', profile: undefined }],
      pendingRevalidates: {},
      pendingRevalidateWrites: [],
      incrementalCache: { revalidateTag },
    } as any

    await expect(
      waitForRevalidates(executeRevalidates(workStore))
    ).rejects.toBe(failedUpdate)
    await waitForRevalidates(executeRevalidates(workStore))

    expect(updateTags).toHaveBeenCalledTimes(2)
    expect(revalidateTag).toHaveBeenCalledTimes(2)
  })
})
