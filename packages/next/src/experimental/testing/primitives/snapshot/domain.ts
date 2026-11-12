export interface DomainMatchResult {
  pass: boolean
  message?: string
  /**
   * The captured value viewed through the template's lens.
   *
   * Where the template uses patterns (e.g. regexes) or omits details,
   * the resolved string adopts those patterns. Where the template doesn't
   * match, the resolved string uses literal captured values instead.
   *
   * Used for two purposes:
   * - **Diff display** (actual side): compared against `expected`
   *   so the diff highlights only genuine mismatches, not pattern-vs-literal noise.
   * - **Snapshot update** (`--update`): written as the new snapshot content,
   *   preserving user-edited patterns from matched regions while incorporating
   *   actual values for mismatched regions.
   *
   * When omitted, falls back to `render(capture(received))` (the raw rendered value).
   */
  resolved?: string
  /**
   * The stored template re-rendered as a string, representing what the user
   * originally wrote or last saved.
   *
   * Used as the expected side in diff display.
   *
   * When omitted, falls back to the raw snapshot string from the snap file
   * or inline snapshot.
   */
  expected?: string
}

export interface DomainSnapshotAdapter<Captured = unknown, Expected = unknown> {
  name: string
  capture: (received: unknown) => Captured
  render: (captured: Captured) => string
  parseExpected: (input: string) => Expected
  match: (captured: Captured, expected: Expected) => DomainMatchResult
}
