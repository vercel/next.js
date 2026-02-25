import { retry } from '../next-test-utils'

export type ValidationEvent =
  | { type: 'validation_start'; requestId: string; url: string }
  | { type: 'validation_end'; requestId: string; url: string }

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

export function extractBuildValidationError(cliOutput: string): string {
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

  return cliOutput.slice(start.endIndex, end.index).trim()
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
): Promise<string> {
  const parsedTargetUrl = new URL(targetUrl)
  const relativeTargetUrl =
    parsedTargetUrl.pathname + parsedTargetUrl.search + parsedTargetUrl.hash

  const requestId = await retry(
    async () => {
      const events = parseValidationMessages(getOutput())
      const start = events.find(
        (e) =>
          e.type === 'validation_start' &&
          normalizeValidationUrl(e.url) === relativeTargetUrl
      )
      expect(start).toBeDefined()
      return start!.requestId
    },
    undefined,
    undefined,
    `wait for validation of '${relativeTargetUrl}' to start`
  )
  return requestId
}

export async function waitForValidationEnd(
  requestId: string,
  getOutput: () => string
): Promise<void> {
  await retry(
    async () => {
      const events = parseValidationMessages(getOutput())
      const end = events.find(
        (e) => e.type === 'validation_end' && e.requestId === requestId
      )
      expect(end).toBeDefined()
    },
    undefined,
    undefined,
    'wait for validation to end'
  )
}

export async function waitForValidation(
  url: string,
  getOutput: () => string
): Promise<void> {
  const requestId = await waitForValidationStart(url, getOutput)
  await waitForValidationEnd(requestId, getOutput)
}
