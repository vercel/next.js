import {
  BUILT,
  childEntryHasActiveParent,
  disposeInactiveEntries,
  EntryTypes,
  getActiveEntryBundlePaths,
  getEntryKey,
  reviveChildEntriesFor,
} from './on-demand-entry-handler'
import { PAGE_TYPES } from '../../lib/page-types'

const MAX_INACTIVE_AGE = 1000 * 5

function makeEntry(bundlePath: string, lastActiveTime = Date.now()) {
  return {
    type: EntryTypes.ENTRY,
    bundlePath,
    absolutePagePath: `/project/${bundlePath}.tsx`,
    request: `./${bundlePath}.tsx`,
    dispose: false,
    lastActiveTime,
    status: BUILT,
  } as const
}

function makeChildEntry(bundlePath: string, parentEntries: string[]) {
  return {
    type: EntryTypes.CHILD_ENTRY,
    bundlePath,
    parentEntries: new Set(parentEntries),
    absoluteEntryFilePath: `/project/${bundlePath}.tsx`,
    request: `next-flight-client-entry-loader!./${bundlePath}.tsx`,
    dispose: false,
    lastActiveTime: Date.now(),
  } as const
}

describe('disposeInactiveEntries', () => {
  it('disposes stale entries', () => {
    const entries: Record<string, any> = {
      stale: makeEntry('app/stale/page', Date.now() - MAX_INACTIVE_AGE * 2),
      active: makeEntry('app/active/page', Date.now()),
    }

    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)

    expect(entries.stale.dispose).toBe(true)
    expect(entries.active.dispose).toBe(false)
  })

  it('does not dispose middleware or instrumentation entries', () => {
    const entries: Record<string, any> = {
      middleware: makeEntry('middleware', Date.now() - MAX_INACTIVE_AGE * 2),
      instrumentation: makeEntry(
        'instrumentation',
        Date.now() - MAX_INACTIVE_AGE * 2
      ),
    }

    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)

    expect(entries.middleware.dispose).toBe(false)
    expect(entries.instrumentation.dispose).toBe(false)
  })

  it('keeps child entries while a parent entry is active', () => {
    const entries: Record<string, any> = {
      parent: makeEntry('app/parent/page', Date.now()),
      child: makeChildEntry('app/parent/page', ['app/parent/page']),
    }

    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)

    expect(entries.parent.dispose).toBe(false)
    expect(entries.child.dispose).toBe(false)
    expect(Array.from(entries.child.parentEntries)).toEqual(['app/parent/page'])
  })

  it('disposes a child entry in the same pass as its parent', () => {
    const entries: Record<string, any> = {
      parent: makeEntry('app/parent/page', Date.now() - MAX_INACTIVE_AGE * 2),
      // The child entry's own bundle path equals its parent entry name (this
      // is how the flight client entry plugin registers them), so a disposal
      // check must only consider ENTRY records as parents.
      child: makeChildEntry('app/parent/page', ['app/parent/page']),
    }

    // Parents age out first within the pass, so the orphaned child is
    // scheduled in the same pass instead of lagging a cleanup rebuild
    // behind. The parent link itself is kept, so the child can be revived
    // together with the parent.
    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)
    expect(entries.parent.dispose).toBe(true)
    expect(entries.child.dispose).toBe(true)
    expect(Array.from(entries.child.parentEntries)).toEqual(['app/parent/page'])
  })

  it('disposes a child entry whose parent entries are gone', () => {
    const entries: Record<string, any> = {
      child: makeChildEntry('app/gone/page', ['app/gone/page']),
    }

    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)

    expect(entries.child.dispose).toBe(true)
  })

  it('disposes a child entry with an empty parent set', () => {
    const entries: Record<string, any> = {
      child: makeChildEntry('app/orphan/page', []),
    }

    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)

    expect(entries.child.dispose).toBe(true)
  })

  it('keeps a child entry alive while any of its parents is active', () => {
    const entries: Record<string, any> = {
      staleParent: makeEntry(
        'app/stale/page',
        Date.now() - MAX_INACTIVE_AGE * 2
      ),
      activeParent: makeEntry('app/active/page', Date.now()),
      child: makeChildEntry('app/shared/page', [
        'app/stale/page',
        'app/active/page',
      ]),
    }

    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)
    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)

    expect(entries.staleParent.dispose).toBe(true)
    expect(entries.activeParent.dispose).toBe(false)
    expect(entries.child.dispose).toBe(false)
    expect(Array.from(entries.child.parentEntries).sort()).toEqual([
      'app/active/page',
      'app/stale/page',
    ])
  })

  it('revives a child entry when its parent is revived after being scheduled for disposal', () => {
    const entries: Record<string, any> = {
      parent: makeEntry('app/parent/page', Date.now() - MAX_INACTIVE_AGE * 2),
      child: makeChildEntry('app/parent/page', ['app/parent/page']),
    }

    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)
    expect(entries.parent.dispose).toBe(true)
    expect(entries.child.dispose).toBe(true)

    // The route is visited again before the disposal machinery removes the
    // records. Revival clears the child's pending disposal synchronously
    // (the periodic recompute would otherwise lag it by one pass).
    entries.parent.dispose = false
    entries.parent.lastActiveTime = Date.now()
    reviveChildEntriesFor(entries, entries.parent.bundlePath)

    expect(entries.child.dispose).toBe(false)

    // And the next pass agrees with the revival.
    disposeInactiveEntries(entries, MAX_INACTIVE_AGE)
    expect(entries.parent.dispose).toBe(false)
    expect(entries.child.dispose).toBe(false)
    expect(Array.from(entries.child.parentEntries)).toEqual(['app/parent/page'])
  })

  it('reviveChildEntriesFor only clears children of the revived parent', () => {
    const entries: Record<string, any> = {
      parentA: {
        ...makeEntry('app/a/page', Date.now() - MAX_INACTIVE_AGE * 2),
        dispose: true,
      },
      parentB: makeEntry('app/b/page', Date.now()),
      childA: {
        ...makeChildEntry('app/a/page', ['app/a/page']),
        dispose: true,
      },
      childB: {
        ...makeChildEntry('app/b/page', ['app/b/page']),
        dispose: true,
      },
    }

    reviveChildEntriesFor(entries, 'app/a/page')

    expect(entries.childA.dispose).toBe(false)
    expect(entries.childB.dispose).toBe(true)
  })
})

describe('getEntryKey', () => {
  it('composes compiler, bundle type and page', () => {
    expect(getEntryKey('client', PAGE_TYPES.APP, 'app/parent/page')).toBe(
      'client@app@app/parent/page'
    )
  })
})

describe('getActiveEntryBundlePaths / childEntryHasActiveParent', () => {
  it('only counts undisposed ENTRY records as active parents', () => {
    const entries: Record<string, any> = {
      activeParent: makeEntry('app/active/page', Date.now()),
      staleParent: {
        ...makeEntry('app/stale/page', Date.now()),
        dispose: true,
      },
      // A child entry shares its parent bundle path and must not count.
      child: makeChildEntry('app/active/page', ['app/active/page']),
    }

    const active = getActiveEntryBundlePaths(entries)
    expect(Array.from(active).sort()).toEqual(['app/active/page'])

    expect(childEntryHasActiveParent(entries.child, active)).toBe(true)

    const orphan = makeChildEntry('app/orphan/page', ['app/orphan/page'])
    expect(childEntryHasActiveParent(orphan, active)).toBe(false)

    const childOfStale = makeChildEntry('app/stale/page', ['app/stale/page'])
    expect(childEntryHasActiveParent(childOfStale, active)).toBe(false)
  })
})
