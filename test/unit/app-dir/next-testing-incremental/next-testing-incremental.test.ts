import {
  selectAffectedTests,
  type DependencyChange,
  type SelectionInput,
} from 'next/dist/experimental/testing/incremental/select-affected'

const baseline: SelectionInput = {
  entryIds: ['unit', 'rsc', 'browser'],
  previousEntryIds: ['unit', 'rsc', 'browser'],
  discoveryRevision: 'config-and-entries-1',
}

function change(overrides: Partial<DependencyChange> = {}): DependencyChange {
  return {
    revision: 'compiler-2',
    discoveryRevision: baseline.discoveryRevision,
    affectedEntryIds: ['rsc'],
    complete: true,
    ...overrides,
  }
}

describe('compiler-backed affected selection', () => {
  it('selects only compiler-reported consumers when coverage is complete', () => {
    expect(selectAffectedTests({ ...baseline, changes: [change()] })).toEqual({
      entryIds: ['rsc'],
      reason: 'compiler-dependencies',
    })
  })

  it('unions all pending compiler changes in discovery order', () => {
    expect(
      selectAffectedTests({
        ...baseline,
        changes: [
          change({ affectedEntryIds: ['browser', 'browser'] }),
          change({ revision: 'compiler-3', affectedEntryIds: ['unit'] }),
        ],
      }).entryIds
    ).toEqual(['unit', 'browser'])
  })

  it('adds newly discovered tests and drops deleted tests', () => {
    expect(
      selectAffectedTests({
        ...baseline,
        entryIds: ['unit', 'new', 'browser'],
        changes: [change()],
      }).entryIds
    ).toEqual(['new'])
  })

  it('runs the initial discovery even without pending changes', () => {
    expect(
      selectAffectedTests({ ...baseline, previousEntryIds: [], changes: [] })
        .entryIds
    ).toEqual(baseline.entryIds)
  })

  it('can omit unaffected tests only with available dependency evidence', () => {
    expect(selectAffectedTests({ ...baseline, changes: [] }).entryIds).toEqual(
      []
    )
    expect(selectAffectedTests(baseline)).toEqual({
      entryIds: baseline.entryIds,
      reason: 'missing-dependencies',
    })
  })

  it.each([
    ['global-invalidation', { invalidateAll: true, changes: [] }],
    ['incomplete-dependencies', { changes: [change({ complete: false })] }],
    [
      'stale-discovery',
      { changes: [change({ discoveryRevision: 'old-config-or-profile' })] },
    ],
    [
      'unknown-entry',
      { changes: [change({ affectedEntryIds: ['unregistered'] })] },
    ],
  ] as const)('widens to full selection for %s', (reason, input) => {
    expect(selectAffectedTests({ ...baseline, ...input })).toEqual({
      entryIds: baseline.entryIds,
      reason,
    })
  })

  it('does not let complete changes hide incomplete browser/data knowledge', () => {
    expect(
      selectAffectedTests({
        ...baseline,
        changes: [change(), change({ complete: false, affectedEntryIds: [] })],
      }).entryIds
    ).toEqual(baseline.entryIds)
  })

  it('returns each live entry once without mutating discovery', () => {
    const input = Object.freeze({
      ...baseline,
      entryIds: Object.freeze(['unit', 'unit', 'browser']),
    })
    expect(selectAffectedTests(input).entryIds).toEqual(['unit', 'browser'])
    expect(input.entryIds).toEqual(['unit', 'unit', 'browser'])
  })
})
