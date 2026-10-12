import { constants as bufferConstants } from 'buffer'

/**
 * Static generation batches are sent between the main build process and the
 * export workers as JSON. Node's child process IPC channel serializes each
 * message into a single string (`JSON.stringify(message) + '\n'`), and Next's
 * worker thread transport JSON-stringifies the call arguments, so a message can
 * never be longer than V8's maximum string length. When it is, serialization
 * throws `RangeError: Invalid string length`; for worker results this happens
 * inside the IPC layer and would otherwise leave the build waiting forever.
 *
 * The helpers below compute the exact length of those messages without ever
 * building the full string, so that we can fail with an actionable error
 * before sending.
 */
export const MAX_IPC_MESSAGE_LENGTH: number = bufferConstants.MAX_STRING_LENGTH

/**
 * jest-worker message type for a successful result (`PARENT_MESSAGE_OK`),
 * sent as `[PARENT_MESSAGE_OK, result]`.
 */
const PARENT_MESSAGE_OK = 0
/**
 * jest-worker message type for a method call (`CHILD_MESSAGE_CALL`), sent as
 * `[CHILD_MESSAGE_CALL, false, method, args]`.
 */
const CHILD_MESSAGE_CALL = 1

const EXPORT_PAGES_METHOD = 'exportPages'

/** Length of the newline Node's JSON IPC channel appends to every message. */
const IPC_MESSAGE_DELIMITER_LENGTH = 1

export type ExportWorkerTransport = 'child-process' | 'worker-thread'

type MessageDirection = 'results' | 'seeds'

export class ExportIpcMessageTooLargeError extends Error {
  constructor({
    direction,
    pageCount,
    length,
    limit,
  }: {
    direction: MessageDirection
    pageCount: number
    /** `undefined` when a single value was too large to measure. */
    length: number | undefined
    limit: number
  }) {
    const what =
      direction === 'results'
        ? 'the static generation results'
        : 'the resume data cache seeds'
    const from =
      direction === 'results'
        ? 'from a build worker back to the main build process'
        : 'from the main build process to a build worker'
    const size =
      length === undefined
        ? `at least ${limit} characters`
        : `${length} characters`

    super(
      `Static generation failed because ${what} for a batch of ${pageCount} ` +
        `pages are too large to send ${from} (${size}, the maximum is ${limit}).\n` +
        `This can happen with Cache Components when pages cache large ` +
        `amounts of data with 'use cache', because each page's resume data ` +
        `cache is sent between build workers.\n` +
        `To fix this, reduce the size of the cached data, or make each batch ` +
        `smaller by lowering \`experimental.staticGenerationMinPagesPerWorker\` ` +
        `and/or increasing \`experimental.cpus\` in your Next.js config.`
    )
    this.name = 'ExportIpcMessageTooLargeError'
  }
}

function isInvalidStringLengthError(err: unknown): boolean {
  return err instanceof RangeError && err.message === 'Invalid string length'
}

/**
 * Length of a value's JSON encoding as an array element (where `undefined`,
 * functions and symbols are encoded as `null`).
 */
function getArrayElementJsonLength(value: unknown): number {
  return (JSON.stringify(value) ?? 'null').length
}

/**
 * Length of a JSON array's encoding, given the encoded length of each element:
 * `[` + elements joined by `,` + `]`.
 */
function getJsonArrayLength(elementLengths: number, elementCount: number) {
  return 2 + elementLengths + Math.max(elementCount - 1, 0)
}

/**
 * Exact length of the IPC message a child process export worker sends back to
 * the main process for `results`:
 * `JSON.stringify([PARENT_MESSAGE_OK, results]) + '\n'`.
 *
 * May throw if a single result cannot be stringified on its own.
 */
export function getExportResultsMessageLength(
  results: ReadonlyArray<unknown>
): number {
  let resultsLength = 0
  for (const result of results) {
    resultsLength += getArrayElementJsonLength(result)
  }

  return (
    getJsonArrayLength(
      String(PARENT_MESSAGE_OK).length +
        getJsonArrayLength(resultsLength, results.length),
      2
    ) + IPC_MESSAGE_DELIMITER_LENGTH
  )
}

/**
 * Exact length of the message that carries an `exportPages` call with `input`:
 * - child process: `JSON.stringify([CHILD_MESSAGE_CALL, false, 'exportPages', [input]]) + '\n'`
 * - worker thread: `JSON.stringify([input])` (the argument sanitizer in
 *   `lib/worker.ts`)
 *
 * The seed map (`renderResumeDataCachesByPage`), which holds the large values,
 * is measured entry by entry. May throw if a single value cannot be
 * stringified on its own.
 */
export function getExportPagesInputMessageLength(
  input: { renderResumeDataCachesByPage?: Record<string, string> },
  transport: ExportWorkerTransport
): number {
  const { renderResumeDataCachesByPage } = input

  let inputLength: number
  if (renderResumeDataCachesByPage) {
    // Measure everything but the seed map in one go, then add the encoded
    // length of the map in place of the `{}` placeholder.
    inputLength =
      JSON.stringify({ ...input, renderResumeDataCachesByPage: {} }).length -
      2 +
      getSeedMapJsonLength(renderResumeDataCachesByPage)
  } else {
    inputLength = JSON.stringify(input).length
  }

  // The input is the single element of the arguments array.
  const argsLength = getJsonArrayLength(inputLength, 1)

  if (transport === 'worker-thread') {
    return argsLength
  }

  const headerLength =
    String(CHILD_MESSAGE_CALL).length +
    JSON.stringify(false).length +
    JSON.stringify(EXPORT_PAGES_METHOD).length
  return (
    getJsonArrayLength(headerLength + argsLength, 4) +
    IPC_MESSAGE_DELIMITER_LENGTH
  )
}

function getSeedMapJsonLength(seeds: Record<string, string>): number {
  let entriesLength = 0
  let entryCount = 0
  for (const key of Object.keys(seeds)) {
    const value = JSON.stringify(seeds[key])
    // Properties whose value can't be represented in JSON are omitted.
    if (value === undefined) continue
    // `"key":value`
    entriesLength += JSON.stringify(key).length + 1 + value.length
    entryCount++
  }
  // `{` + entries joined by `,` + `}`
  return getJsonArrayLength(entriesLength, entryCount)
}

function measure(
  getLength: () => number,
  error: Omit<
    ConstructorParameters<typeof ExportIpcMessageTooLargeError>[0],
    'length'
  >
): void {
  let length: number
  try {
    length = getLength()
  } catch (err) {
    if (isInvalidStringLengthError(err)) {
      throw new ExportIpcMessageTooLargeError({ ...error, length: undefined })
    }
    throw err
  }

  if (length > error.limit) {
    throw new ExportIpcMessageTooLargeError({ ...error, length })
  }
}

/**
 * Throws an `ExportIpcMessageTooLargeError` if the results of a batch would be
 * too large to send back to the main process over the child process IPC
 * channel.
 */
export function assertExportResultsFitInIpcMessage(
  results: ReadonlyArray<unknown>,
  pageCount: number,
  limit: number = MAX_IPC_MESSAGE_LENGTH
): void {
  measure(() => getExportResultsMessageLength(results), {
    direction: 'results',
    pageCount,
    limit,
  })
}

/**
 * Throws an `ExportIpcMessageTooLargeError` if an `exportPages` call with
 * `input` would be too large to send to a build worker.
 */
export function assertExportPagesInputFitsInIpcMessage(
  input: { renderResumeDataCachesByPage?: Record<string, string> },
  pageCount: number,
  transport: ExportWorkerTransport,
  limit: number = MAX_IPC_MESSAGE_LENGTH
): void {
  measure(() => getExportPagesInputMessageLength(input, transport), {
    direction: 'seeds',
    pageCount,
    limit,
  })
}

/**
 * Results only need to be checked when they are sent back over a child
 * process IPC channel. Worker threads transfer results with the structured
 * clone algorithm, which does not build a single string for the message.
 */
export function shouldCheckExportResultsMessageSize({
  isMainThread,
  hasIpcChannel,
}: {
  isMainThread: boolean
  hasIpcChannel: boolean
}): boolean {
  return isMainThread && hasIpcChannel
}
