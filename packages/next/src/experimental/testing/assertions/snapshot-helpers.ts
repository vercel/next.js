import type {
  AsyncExpectationResult,
  ExpectationResult,
  MatcherState,
  SyncExpectationResult,
} from '../../../compiled/next-test-primitives'

export interface DomainMatchResult {
  pass: boolean
  message?: string
  resolved?: string
  expected?: string
}

export interface DomainSnapshotAdapter<Captured = unknown, Expected = unknown> {
  name: string
  capture: (received: unknown) => Captured
  render: (captured: Captured) => string
  parseExpected: (input: string) => Expected
  match: (captured: Captured, expected: Expected) => DomainMatchResult
}

export interface SnapshotHelpers {
  toMatchSnapshot(
    this: MatcherState,
    received: unknown,
    propertiesOrHint?: object | string,
    hint?: string
  ): SyncExpectationResult
  toMatchInlineSnapshot(
    this: MatcherState,
    received: unknown,
    propertiesOrInlineSnapshot?: object | string,
    inlineSnapshotOrHint?: string,
    hint?: string
  ): SyncExpectationResult
  toMatchFileSnapshot(
    this: MatcherState,
    received: unknown,
    filepath: string,
    hint?: string
  ): AsyncExpectationResult
  toMatchDomainSnapshot(
    this: MatcherState,
    domain: DomainSnapshotAdapter<any, any>,
    received: unknown
  ): ExpectationResult
  toMatchDomainInlineSnapshot(
    this: MatcherState,
    domain: DomainSnapshotAdapter<any, any>,
    received: unknown,
    inlineSnapshot?: string
  ): ExpectationResult
}

export type SnapshotHelperName = keyof SnapshotHelpers
export type SnapshotHelperDispatch = (
  method: SnapshotHelperName,
  state: MatcherState,
  args: unknown[]
) => ExpectationResult

/** Preserve the actual matcher receiver and argument list across the facade. */
export function createSnapshotHelpers(
  dispatch: SnapshotHelperDispatch
): SnapshotHelpers {
  return {
    toMatchSnapshot(_received, _propertiesOrHint, _hint) {
      return dispatch('toMatchSnapshot', this, [
        ...arguments,
      ]) as SyncExpectationResult
    },
    toMatchInlineSnapshot(
      _received,
      _propertiesOrInlineSnapshot,
      _inlineSnapshotOrHint,
      _hint
    ) {
      return dispatch('toMatchInlineSnapshot', this, [
        ...arguments,
      ]) as SyncExpectationResult
    },
    toMatchFileSnapshot(_received, _filepath, _hint) {
      return dispatch('toMatchFileSnapshot', this, [
        ...arguments,
      ]) as AsyncExpectationResult
    },
    toMatchDomainSnapshot(_domain, _received) {
      return dispatch('toMatchDomainSnapshot', this, [...arguments])
    },
    toMatchDomainInlineSnapshot(_domain, _received, _inlineSnapshot) {
      return dispatch('toMatchDomainInlineSnapshot', this, [...arguments])
    },
  }
}
