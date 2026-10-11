import type { createBrowserFixture } from './fixture'

type BrowserAttemptContext = Parameters<
  typeof createBrowserFixture
>[0]['attempt']
type BrowserFixture = Awaited<ReturnType<typeof createBrowserFixture>>

export type BrowserTestAttempt = BrowserAttemptContext & {
  readonly id: string
  readonly fileId: string
  readonly testId: string
  readonly retry: number
  readonly repeat: 0
}

interface BrowserTestingBinding {
  getActiveAttempt(): BrowserTestAttempt | undefined
  createFixture(attempt: BrowserTestAttempt): Promise<BrowserFixture>
  fixtures: WeakMap<BrowserTestAttempt, Promise<BrowserFixture>>
}

let binding: BrowserTestingBinding | undefined
// Retain only the actual C scope guard after revocation. A caught late call
// must still reach C's originating-scope error sink during the worker's drain.
let getOriginatingAttempt: BrowserTestingBinding['getActiveAttempt'] | undefined

/** Called through the emitted entry with that entry's actual C API instance. */
export function initializeBrowserTesting(options: {
  getActiveAttempt(): BrowserTestAttempt | undefined
  createFixture(attempt: BrowserTestAttempt): Promise<BrowserFixture>
}): { dispose(): void } {
  if (binding) throw new Error('Next browser testing is already initialized')
  const current: BrowserTestingBinding = {
    ...options,
    fixtures: new WeakMap(),
  }
  binding = current
  getOriginatingAttempt = options.getActiveAttempt
  return {
    dispose() {
      if (binding === current) binding = undefined
    },
  }
}

/** One browser fixture per actual test attempt, including retries. */
export function browser(): Promise<BrowserFixture> {
  const current = binding
  const attempt = getOriginatingAttempt?.()
  if (!current) {
    throw new Error(
      'Browser fixtures require an initialized Next browser test environment'
    )
  }
  if (!attempt) {
    throw new Error('Browser fixtures require an active Next test attempt')
  }
  attempt.signal.throwIfAborted()
  let fixture = current.fixtures.get(attempt)
  if (!fixture) {
    fixture = current.createFixture(attempt)
    current.fixtures.set(attempt, fixture)
  }
  return fixture
}
