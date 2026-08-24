//@ts-check

const fs = require('fs')

const MAX_HISTORY_LENGTH = 20

/**
 * @typedef {{
 *   updatedAt: number
 *   sequence: number
 *   phase: string
 *   testName?: string
 * }} TestFileProgressEvent
 */

/**
 * @typedef {TestFileProgressEvent & {
 *   pid: number
 *   history: TestFileProgressEvent[]
 * }} TestFileProgress
 */

/** @type {TestFileProgressEvent[]} */
const history = []
let sequence = 0

/**
 * Reports progress from the Jest process to its parent test runner. The write
 * is atomic so the parent never observes a partially written heartbeat.
 *
 * @param {string} phase
 * @param {string | undefined} [testName]
 */
function reportTestFileProgress(phase, testName) {
  const progressPath = process.env.NEXT_TEST_FILE_PROGRESS_PATH
  if (!progressPath) return

  const event = {
    updatedAt: Date.now(),
    sequence: ++sequence,
    phase,
    ...(testName ? { testName } : {}),
  }
  history.push(event)
  if (history.length > MAX_HISTORY_LENGTH) history.shift()

  const temporaryPath = `${progressPath}.tmp`
  try {
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify({
        ...event,
        pid: process.pid,
        history,
      })
    )
    fs.renameSync(temporaryPath, progressPath)
  } catch {
    // Diagnostics must never make a test fail.
  }
}

/**
 * @param {string} progressPath
 * @returns {TestFileProgress | null}
 */
function readTestFileProgress(progressPath) {
  try {
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
    if (
      typeof progress?.updatedAt !== 'number' ||
      typeof progress?.sequence !== 'number' ||
      typeof progress?.phase !== 'string' ||
      !Array.isArray(progress?.history)
    ) {
      return null
    }
    return progress
  } catch {
    return null
  }
}

/**
 * @param {TestFileProgress | null} progress
 * @param {number} [now]
 */
function formatTestFileProgress(progress, now = Date.now()) {
  if (!progress) return 'No progress heartbeat was received.'

  const current = progress.testName
    ? `${progress.phase}: ${progress.testName}`
    : progress.phase
  const historyLines = progress.history.map((event) => {
    const age = Math.max(0, Math.round((now - event.updatedAt) / 1000))
    const description = event.testName
      ? `${event.phase}: ${event.testName}`
      : event.phase
    return `  ${age}s ago - ${description}`
  })

  return [
    `Last progress (${Math.max(0, Math.round((now - progress.updatedAt) / 1000))}s ago): ${current}`,
    'Recent progress:',
    ...historyLines,
  ].join('\n')
}

/**
 * @param {{
 *   progressPath: string
 *   stallTimeoutMs: number
 *   pollIntervalMs?: number
 *   now?: () => number
 *   onStall: (progress: TestFileProgress | null) => void
 * }} options
 */
function createTestFileProgressMonitor(options) {
  const now = options.now ?? Date.now
  let lastObservedAt = now()
  /** @type {number | undefined} */
  let lastSequence
  let stalled = false

  const check = () => {
    const progress = readTestFileProgress(options.progressPath)
    if (progress && progress.sequence !== lastSequence) {
      lastSequence = progress.sequence
      lastObservedAt = now()
      stalled = false
    }

    if (!stalled && now() - lastObservedAt >= options.stallTimeoutMs) {
      stalled = true
      options.onStall(progress)
    }
  }

  const pollIntervalMs = options.pollIntervalMs ?? 5_000
  const interval =
    pollIntervalMs > 0 ? setInterval(check, pollIntervalMs) : null
  interval?.unref()

  return {
    check,
    stop() {
      if (interval) clearInterval(interval)
      fs.rmSync(options.progressPath, { force: true })
      fs.rmSync(`${options.progressPath}.tmp`, { force: true })
    },
  }
}

module.exports = {
  createTestFileProgressMonitor,
  formatTestFileProgress,
  readTestFileProgress,
  reportTestFileProgress,
}
