import { retry } from '../next-test-utils'
import { getDeterministicOutput } from '../../e2e/app-dir/cache-components-errors/utils'
import { inspect } from 'util'

export type ValidationEvent =
  | ValidationStartEvent
  | ValidationEndEvent
  | ValidationAbortedEvent

type ValidationStartEvent = {
  type: 'validation_start'
  requestId: string
  url: string
}
type ValidationEndEvent = {
  type: 'validation_end'
  requestId: string
  url: string
}
// Emitted instead of a start/end pair when a request is aborted before its
// detached validation runs (e.g. Server Components HMR cancellation).
type ValidationAbortedEvent = {
  type: 'validation_aborted'
  requestId: string
  url: string
}

export function parseValidationMessages(output: string): ValidationEvent[] {
  const messageRe = /<VALIDATION_MESSAGE>(.*?)<\/VALIDATION_MESSAGE>/g
  const events: ValidationEvent[] = []
  let match: RegExpExecArray | null
  while ((match = messageRe.exec(output)) !== null) {
    try {
      events.push(JSON.parse(match[1]))
    } catch (err) {
      throw new Error(`Failed to parse message '${match[1]}'`, {
        cause: err,
      })
    }
  }
  return events
}

export async function getDevCliValidationOutput(
  url: string,
  getOutput: () => string
): Promise<string> {
  const {
    start: { requestId },
  } = await waitForValidation(url, getOutput)
  const output = extractValidationOutput(getOutput(), {
    isMinified: false,
    requestId,
  })
  // Strip `GET <url> 200 ...` log line which may end up between the start/end messages
  return output
    .split('\n')
    .filter((line) => !line.startsWith(`GET ${normalizeValidationUrl(url)}`))
    .join('\n')
}

export function extractBuildValidationError(
  cliOutput: string,
  opts?: { isMinified?: boolean }
): string {
  return extractValidationOutput(cliOutput, opts)
}

export function extractValidationOutput(
  cliOutput: string,
  {
    isMinified = true,
    requestId,
  }: { isMinified?: boolean; requestId?: string } = {}
): string {
  const markerRe = /<VALIDATION_MESSAGE>(.*?)<\/VALIDATION_MESSAGE>/g

  // Find all marker positions and their content
  const markers: {
    index: number
    endIndex: number
    data: ValidationEvent
  }[] = []
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(cliOutput)) !== null) {
    // JSON.parse must succeed — if it throws, let the error propagate
    const data: ValidationEvent = JSON.parse(m[1])
    // If we're looking for a specific request ID, ignore other events.
    if (requestId !== undefined && data.requestId !== requestId) {
      continue
    }
    markers.push({
      index: m.index,
      endIndex: m.index + m[0].length,
      data,
    })
  }

  // Expect exactly two markers: one validation_start and one validation_end
  if (markers.length !== 2) {
    throw new Error(
      `Expected exactly 2 validation markers, found ${markers.length}.\n` +
        `CLI output:\n${cliOutput}`
    )
  }

  const [start, end] = markers
  if (
    start.data.type !== 'validation_start' ||
    end.data.type !== 'validation_end'
  ) {
    throw new Error(
      `Expected [validation_start, validation_end] markers, got [${start.data.type}, ${end.data.type}].\n` +
        `CLI output:\n${cliOutput}`
    )
  }
  if (start.data.requestId !== end.data.requestId) {
    throw new Error(
      `Expected [validation_start, validation_end] markers to come from the same request`
    )
  }

  const output = cliOutput.slice(start.endIndex, end.index).trim()
  return getDeterministicOutput(output, { isMinified })
}

export function normalizeValidationUrl(url: string): string {
  // RSC requests include ?_rsc=... in the URL. Strip it so the event URL
  // matches what browser.url() returns (which has no _rsc param).
  const parsed = new URL(url, 'http://n')
  parsed.searchParams.delete('_rsc')
  return parsed.pathname + parsed.search + parsed.hash
}

export async function waitForValidationStart(
  targetUrl: string,
  getOutput: () => string
): Promise<ValidationStartEvent> {
  const parsedTargetUrl = new URL(targetUrl)
  const relativeTargetUrl =
    parsedTargetUrl.pathname + parsedTargetUrl.search + parsedTargetUrl.hash

  return await retry(
    async () => {
      const events = parseValidationMessages(getOutput())
      const start = events.find(
        (e) =>
          e.type === 'validation_start' &&
          normalizeValidationUrl(e.url) === relativeTargetUrl
      )
      expect(start).toBeDefined()
      return start! as ValidationStartEvent
    },
    undefined,
    undefined,
    `wait for validation of '${relativeTargetUrl}' to start`
  )
}

export async function waitForValidationEnd(
  start: ValidationStartEvent,
  getOutput: () => string
): Promise<ValidationEndEvent> {
  const events = parseValidationMessages(getOutput())
  assertStartFound(start, events)

  return await retry(
    async () => {
      const events = parseValidationMessages(getOutput())
      assertStartFound(start, events)
      const end = events.find(
        (e) => e.type === 'validation_end' && e.requestId === start.requestId
      )
      expect(end).toBeDefined()
      return end as ValidationEndEvent
    },
    undefined,
    undefined,
    'wait for validation to end'
  )
}

function assertStartFound(
  start: ValidationStartEvent,
  events: ValidationEvent[]
) {
  if (!events.find((e) => e.requestId === start.requestId)) {
    throw new Error(
      `Start event not found in logs: ${inspect({ start, events })}. This might mean there's a missing await around \`waitForValidationEnd\` or its caller`
    )
  }
}

export async function waitForValidation(url: string, getOutput: () => string) {
  const start = await waitForValidationStart(url, getOutput)
  const end = await waitForValidationEnd(start, getOutput)
  return { start, end }
}

type PrerenderResult = {
  cliOutput: string
  exitCode: number | NodeJS.Signals
}

export function expectNoBuildValidationErrors(result: PrerenderResult) {
  // Check the logs before checking the error code.
  // If it fails, the logs are more likely to show a useful reason than an error code.
  expect(result.cliOutput).not.toContain('Build-time instant validation failed')
  // As a sanity check, parse the log and make sure that instant validation actually ran.
  expect(extractBuildValidationError(result.cliOutput)).not.toContain(
    'Build-time instant validation failed'
  )
  expect(result.exitCode).toBe(0)
}

export function expectBuildValidationSkipped(result: PrerenderResult) {
  // Check the logs before checking the error code.
  // If it fails, the logs are more likely to show a useful reason than an error code.
  expect(result.cliOutput).not.toContain('Build-time instant validation failed')
  expect(parseValidationMessages(result.cliOutput)).toHaveLength(0)
  expect(result.exitCode).toBe(0)
}
