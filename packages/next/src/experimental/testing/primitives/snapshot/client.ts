import type { DomainSnapshotAdapter } from './domain'
import type { RawSnapshotInfo } from './port/rawSnapshot'
import type { SnapshotResult, SnapshotStateOptions } from './types'
import SnapshotState from './port/state'
import { deepMergeSnapshot } from './port/utils'

function createMismatchError(
  message: string,
  expand: boolean | undefined,
  actual: unknown,
  expected: unknown
) {
  const error = new Error(message)
  Object.defineProperty(error, 'actual', {
    value: actual,
    enumerable: true,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(error, 'expected', {
    value: expected,
    enumerable: true,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(error, 'diffOptions', { value: { expand } })
  return error
}

interface AssertOptions {
  received: unknown
  filepath: string
  name: string
  /**
   * Not required but needed for `SnapshotClient.clearTest` to implement test-retry behavior.
   * @default name
   */
  testId?: string
  message?: string
  isInline?: boolean
  properties?: object
  inlineSnapshot?: string
  error?: Error
  errorMessage?: string
  rawSnapshot?: RawSnapshotInfo
  assertionName?: string
}

interface AssertDomainOptions extends Omit<AssertOptions, 'received'> {
  received: unknown
  adapter: DomainSnapshotAdapter<any, any>
}

interface AssertDomainPollOptions
  extends Omit<AssertDomainOptions, 'received'> {
  poll: (options: { signal: AbortSignal }) => Promise<unknown> | unknown
  timeout?: number
  interval?: number
}

/** Same shape as expect.extend custom matcher result (SyncExpectationResult from @vitest/expect) */
export interface MatchResult {
  pass: boolean
  message: () => string
  actual?: unknown
  expected?: unknown
}

interface SnapshotClientOptions {
  isEqual?: (received: unknown, expected: unknown) => boolean
}

export class SnapshotClient {
  snapshotStateMap: Map<string, SnapshotState> = new Map()

  constructor(private options: SnapshotClientOptions = {}) {}

  async setup(filepath: string, options: SnapshotStateOptions): Promise<void> {
    if (this.snapshotStateMap.has(filepath)) {
      return
    }
    this.snapshotStateMap.set(
      filepath,
      await SnapshotState.create(filepath, options)
    )
  }

  async finish(filepath: string): Promise<SnapshotResult> {
    const state = this.getSnapshotState(filepath)
    const result = await state.pack()
    this.snapshotStateMap.delete(filepath)
    return result
  }

  skipTest(filepath: string, testName: string): void {
    const state = this.getSnapshotState(filepath)
    state.markSnapshotsAsCheckedForTest(testName)
  }

  clearTest(filepath: string, testId: string): void {
    const state = this.getSnapshotState(filepath)
    state.clearTest(testId)
  }

  getSnapshotState(filepath: string): SnapshotState {
    const state = this.snapshotStateMap.get(filepath)
    if (!state) {
      throw new Error(
        `The snapshot state for '${filepath}' is not found. Did you call 'SnapshotClient.setup()'?`
      )
    }
    return state
  }

  match(options: AssertOptions): MatchResult {
    const {
      filepath,
      name,
      testId = name,
      message,
      isInline = false,
      properties,
      inlineSnapshot,
      error,
      errorMessage,
      rawSnapshot,
      assertionName,
    } = options
    let { received } = options

    if (!filepath) {
      throw new Error('Snapshot cannot be used outside of test')
    }

    const snapshotState = this.getSnapshotState(filepath)
    if (rawSnapshot?.file === snapshotState.snapshotPath) {
      // note that this hard rejection is best-effort in a sense that,
      // if `toMatchFileSnapshot` is called with a different test file's snapshot path,
      // this check will not catch it.
      throw new Error(
        `File snapshot cannot use the same path as the test snapshot file: ${rawSnapshot.file}`
      )
    }
    const testName = [name, ...(message ? [message] : [])].join(' > ')

    // Probe first so we can mark as checked even on early return
    const expectedSnapshot = snapshotState.probeExpectedSnapshot({
      testName,
      testId,
      isInline,
      inlineSnapshot,
    })

    if (typeof properties === 'object') {
      if (typeof received !== 'object' || !received) {
        expectedSnapshot.markAsChecked()
        throw new Error(
          'Received value must be an object when the matcher has properties'
        )
      }

      let propertiesPass: boolean
      try {
        propertiesPass = this.options.isEqual?.(received, properties) ?? false
      } catch (err) {
        expectedSnapshot.markAsChecked()
        throw err
      }
      if (!propertiesPass) {
        expectedSnapshot.markAsChecked()
        return {
          pass: false,
          message: () => errorMessage || 'Snapshot properties mismatched',
          actual: received,
          expected: properties,
        }
      }
      received = deepMergeSnapshot(received, properties)
    }

    const { actual, expected, key, pass } = snapshotState.match({
      testId,
      testName,
      received,
      isInline,
      error,
      inlineSnapshot,
      rawSnapshot,
      assertionName,
    })

    return {
      pass,
      message: () => `Snapshot \`${key || 'unknown'}\` mismatched`,
      actual: rawSnapshot ? actual : actual?.trim(),
      expected: rawSnapshot ? expected : expected?.trim(),
    }
  }

  assert(options: AssertOptions): void {
    const result = this.match(options)
    if (!result.pass) {
      const snapshotState = this.getSnapshotState(options.filepath)
      throw createMismatchError(
        result.message(),
        snapshotState.expand,
        result.actual,
        result.expected
      )
    }
  }

  matchDomain(options: AssertDomainOptions): MatchResult {
    const {
      received,
      filepath,
      name,
      testId = name,
      message,
      adapter,
      isInline = false,
      inlineSnapshot,
      error,
    } = options

    if (!filepath) {
      throw new Error('Snapshot cannot be used outside of test')
    }

    const captured = adapter.capture(received)
    const rendered = adapter.render(captured)

    const snapshotState = this.getSnapshotState(filepath)
    const testName = [name, ...(message ? [message] : [])].join(' > ')

    const expectedSnapshot = snapshotState.probeExpectedSnapshot({
      testName,
      testId,
      isInline,
      inlineSnapshot,
    })
    expectedSnapshot.markAsChecked()
    const matchResult =
      expectedSnapshot.data !== undefined
        ? adapter.match(captured, adapter.parseExpected(expectedSnapshot.data))
        : undefined
    const { actual, expected, key, pass } = snapshotState.processDomainSnapshot(
      {
        testId,
        received: rendered,
        expectedSnapshot,
        matchResult,
        isInline,
        error,
        assertionName: options.assertionName,
      }
    )

    return {
      pass,
      message: () => `Snapshot \`${key}\` mismatched`,
      actual: actual?.trim(),
      expected: expected?.trim(),
    }
  }

  async pollMatchDomain(
    options: AssertDomainPollOptions
  ): Promise<MatchResult> {
    const {
      poll,
      filepath,
      name,
      testId = name,
      message,
      adapter,
      isInline = false,
      inlineSnapshot,
      error,
      timeout = 1000,
      interval = 50,
    } = options

    if (!filepath) {
      throw new Error('Snapshot cannot be used outside of test')
    }

    const snapshotState = this.getSnapshotState(filepath)
    const testName = [name, ...(message ? [message] : [])].join(' > ')

    const expectedSnapshot = snapshotState.probeExpectedSnapshot({
      testName,
      testId,
      isInline,
      inlineSnapshot,
    })

    const reference =
      expectedSnapshot.data !== undefined &&
      snapshotState.snapshotUpdateState !== 'all'
        ? adapter.parseExpected(expectedSnapshot.data)
        : undefined
    const timeoutController = new AbortController()
    const timedOut =
      timeout > 0
        ? new Promise<void>((r) =>
            setTimeout(() => {
              timeoutController.abort()
              r()
            }, timeout)
          )
        : undefined
    const stableResult = await getStableSnapshot({
      adapter,
      poll: () => poll({ signal: timeoutController.signal }),
      interval,
      timedOut,
      match: reference
        ? (captured) => adapter.match(captured, reference).pass
        : undefined,
    })

    expectedSnapshot.markAsChecked()

    if (stableResult?.rendered === undefined) {
      // the original caller `expect.poll` later manipulates error via `throwWithCause`,
      // so here we can directly throw `lastPollError` if exists.
      if (stableResult?.lastPollError) {
        throw stableResult.lastPollError
      }
      return {
        pass: false,
        message: () =>
          `poll() did not produce a stable snapshot within the timeout`,
      }
    }

    // TODO: should `all` mode ignore parse error?
    // Silently hiding the error and creating snapshot full scratch isn't good either.
    // Users can fix or purge the broken snapshot manually and that decision affects how domain snapshot gets updated.
    const matchResult =
      expectedSnapshot.data !== undefined
        ? adapter.match(
            stableResult.captured,
            adapter.parseExpected(expectedSnapshot.data)
          )
        : undefined
    const { actual, expected, key, pass } = snapshotState.processDomainSnapshot(
      {
        testId,
        received: stableResult.rendered,
        expectedSnapshot,
        matchResult,
        isInline,
        error,
        assertionName: options.assertionName,
      }
    )

    return {
      pass,
      message: () => `Snapshot \`${key}\` mismatched`,
      actual: actual?.trim(),
      expected: expected?.trim(),
    }
  }

  async assertRaw(options: AssertOptions): Promise<void> {
    if (!options.rawSnapshot) {
      throw new Error('Raw snapshot is required')
    }

    const { filepath, rawSnapshot } = options

    if (rawSnapshot.content == null) {
      if (!filepath) {
        throw new Error('Snapshot cannot be used outside of test')
      }

      const snapshotState = this.getSnapshotState(filepath)

      // save the filepath, so it don't lose even if the await make it out-of-context
      options.filepath ||= filepath
      // resolve and read the raw snapshot file
      rawSnapshot.file = await snapshotState.environment.resolveRawPath(
        filepath,
        rawSnapshot.file
      )
      rawSnapshot.content =
        (await snapshotState.environment.readSnapshotFile(rawSnapshot.file)) ??
        undefined
    }

    return this.assert(options)
  }

  clear(): void {
    this.snapshotStateMap.clear()
  }
}

/**
 * Polls repeatedly until the value reaches a stable state.
 *
 * Compares consecutive rendered outputs from the current session —
 * when two consecutive polls produce the same rendered string,
 * the value is considered stable.
 *
 * Every `await` (poll call, interval delay) races against `timedOut`
 * so that hanging polls and delays are interrupted.
 */
async function getStableSnapshot({
  adapter,
  poll,
  interval,
  timedOut,
  match,
}: {
  adapter: DomainSnapshotAdapter<any, any>
  poll: () => Promise<unknown> | unknown
  interval: number
  timedOut?: Promise<void>
  match?: (captured: unknown) => boolean
}) {
  let lastRendered: string | undefined
  let lastPollError: unknown
  let lastStable: { captured: unknown; rendered: string } | undefined

  while (true) {
    try {
      const pollResult = await raceWith(Promise.resolve(poll()), timedOut)
      if (!pollResult.ok) {
        break
      }
      const captured = adapter.capture(pollResult.value)
      const rendered = adapter.render(captured)
      if (lastRendered !== undefined && rendered === lastRendered) {
        lastStable = { captured, rendered }
        if (!match || match(captured)) {
          break
        }
      } else {
        lastRendered = rendered
        lastStable = undefined
      }
    } catch (pollError) {
      // poll() threw — reset stability baseline and retry
      lastRendered = undefined
      lastStable = undefined
      lastPollError = pollError
    }
    const delayed = await raceWith(
      new Promise<void>((r) => setTimeout(r, interval)),
      timedOut
    )
    if (!delayed.ok) {
      break
    }
  }

  return { ...lastStable, lastPollError }
}

/** Type-safe `Promise.race` — tells you which promise won. */
function raceWith<A, B>(
  promise: Promise<A>,
  other?: Promise<B>
): Promise<{ ok: true; value: A } | { ok: false; value: B }> {
  const left = promise.then((value) => ({ ok: true as const, value }))
  if (!other) {
    return left
  }
  return Promise.race([
    left,
    other.then((value) => ({ ok: false as const, value })),
  ])
}
