import { EventEmitter } from 'node:events'
import { join } from 'node:path'

type TestEntry = {
  type: 0
  appPaths: null
  absolutePagePath: string
  request: string
  bundlePath: string
  dispose: boolean
  lastActiveTime: number
  status: symbol
}

const {
  BUILT,
  EntryTypes,
  RuntimeChangedError,
  getEntries,
  getOnDemandEntryCallbackKey,
  removeMissingOnDemandEntry,
  removeStaleOnDemandEntry,
  retryOnDemandEntryRuntimeChange,
} = jest.requireActual('next/dist/server/dev/on-demand-entry-handler') as {
  BUILT: symbol
  EntryTypes: { ENTRY: 0 }
  RuntimeChangedError: new (page: string) => Error
  getEntries(outputPath: string): Record<string, TestEntry>
  getOnDemandEntryCallbackKey(outputPath: string, entryKey: string): string
  removeMissingOnDemandEntry(
    outputPath: string,
    entryKey: string,
    entry: TestEntry
  ): boolean
  removeStaleOnDemandEntry(
    outputPath: string,
    entryKey: string,
    entry: TestEntry
  ): boolean
  retryOnDemandEntryRuntimeChange(
    page: string,
    operation: () => Promise<void>
  ): Promise<void>
}

const { PageNotFoundError } = jest.requireActual(
  'next/dist/shared/lib/utils'
) as {
  PageNotFoundError: new (page: string) => Error
}

const entryKey = 'server@app@/ws/route'

function createEntry(): TestEntry {
  return {
    type: EntryTypes.ENTRY,
    appPaths: null,
    absolutePagePath: join('/virtual', 'app/ws/route.ts'),
    request: join('/virtual', 'app/ws/route.ts'),
    bundlePath: 'app/ws/route',
    dispose: false,
    lastActiveTime: Date.now(),
    status: BUILT,
  }
}

describe('on-demand entry lifecycle', () => {
  it('scopes completion callbacks to one project output', () => {
    const first = join('/virtual', 'first', '.next')
    const second = join('/virtual', 'second', '.next')

    expect(getOnDemandEntryCallbackKey(first, entryKey)).not.toBe(
      getOnDemandEntryCallbackKey(second, entryKey)
    )
    expect(getOnDemandEntryCallbackKey(first, entryKey)).toBe(
      getOnDemandEntryCallbackKey(join(first, 'server'), entryKey)
    )
  })

  it('never removes a replacement under the same key', () => {
    const outputPath = join('/virtual', 'replacement', '.next')
    const entries = getEntries(outputPath)
    const stale = createEntry()
    const replacement = createEntry()
    entries[entryKey] = replacement

    expect(removeStaleOnDemandEntry(outputPath, entryKey, stale)).toBe(false)
    expect(removeMissingOnDemandEntry(outputPath, entryKey, stale)).toBe(false)
    expect(entries[entryKey]).toBe(replacement)

    delete entries[entryKey]
  })

  it('removes an entry from only its owning project', () => {
    const firstPath = join('/virtual', 'first-removal', '.next')
    const secondPath = join('/virtual', 'second-removal', '.next')
    const firstEntries = getEntries(firstPath)
    const secondEntries = getEntries(secondPath)
    const first = createEntry()
    const second = createEntry()
    firstEntries[entryKey] = first
    secondEntries[entryKey] = second

    expect(removeStaleOnDemandEntry(firstPath, entryKey, first)).toBe(true)
    expect(firstEntries[entryKey]).toBeUndefined()
    expect(secondEntries[entryKey]).toBe(second)

    delete secondEntries[entryKey]
  })

  it.each([
    ['missing', removeMissingOnDemandEntry, PageNotFoundError],
    ['stale', removeStaleOnDemandEntry, RuntimeChangedError],
  ])('settles a %s entry with its scoped error', (_, remove, ErrorType) => {
    const outputPath = join('/virtual', String(_), '.next')
    const entries = getEntries(outputPath)
    const entry = createEntry()
    const emit = jest.spyOn(EventEmitter.prototype, 'emit')
    entries[entryKey] = entry

    try {
      expect(remove(outputPath, entryKey, entry)).toBe(true)
      expect(entries[entryKey]).toBeUndefined()
      expect(emit).toHaveBeenCalledWith(
        getOnDemandEntryCallbackKey(outputPath, entryKey),
        expect.any(ErrorType)
      )
    } finally {
      emit.mockRestore()
    }
  })

  it('bounds retries for repeated runtime changes', async () => {
    const operation = jest
      .fn<Promise<void>, []>()
      .mockRejectedValue(new RuntimeChangedError('/ws/route'))

    await expect(
      retryOnDemandEntryRuntimeChange('/ws/route', operation)
    ).rejects.toBeInstanceOf(PageNotFoundError)
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('stops retrying when the new runtime succeeds', async () => {
    const operation = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new RuntimeChangedError('/ws/route'))
      .mockResolvedValue(undefined)

    await expect(
      retryOnDemandEntryRuntimeChange('/ws/route', operation)
    ).resolves.toBeUndefined()
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry unrelated compilation failures', async () => {
    const error = new Error('compile failed')
    const operation = jest.fn<Promise<void>, []>().mockRejectedValue(error)

    await expect(
      retryOnDemandEntryRuntimeChange('/ws/route', operation)
    ).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
