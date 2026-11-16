import { EventEmitter } from 'events'
import { PassThrough, Readable } from 'stream'

import {
  agentFeedbackReviewUrl,
  nextFeedback,
  openAgentFeedbackReviewForm,
} from './agent-feedback'

function validReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 5,
    triggerReason: 'unexpected-behavior',
    title: 'A generic Next.js behavior differs from the expected result',
    setup: {
      mode: 'development',
      bundler: 'turbopack',
      relevantFeatures: ['Agent feedback'],
    },
    steps: ['Run the generic reproduction in a Next.js application.'],
    observed: ['The observed result differs from the expected result.'],
    expected: 'The generic reproduction should produce the expected result.',
    comparison: 'The control case produces the expected result.',
    frequency: 'once',
    outcome: 'resolved',
    nextVersion: '16.5.0-canary.0',
    agent: 'test-agent',
    ...overrides,
  }
}

function encodedReport(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify(validReport(overrides))).toString(
    'base64url'
  )
}

describe('agentFeedbackReviewUrl', () => {
  it('builds a review URL for a schema version 5 report', () => {
    const report = encodedReport()

    expect(agentFeedbackReviewUrl(report)).toBe(
      `https://nextjs.org/agent-feedback#report=${report}`
    )
  })

  it('builds a review URL for a schema version 6 report', () => {
    const report = encodedReport({
      schemaVersion: 6,
      agentVersion: '1.2.3',
      model: 'claude-opus-5.5',
      reasoningEffort: 'high',
    })

    expect(agentFeedbackReviewUrl(report)).toBe(
      `https://nextjs.org/agent-feedback#report=${report}`
    )
  })

  it('rejects invalid and unsupported reports', () => {
    expect(() => agentFeedbackReviewUrl('not+base64')).toThrow(
      'The report must be unpadded base64url.'
    )
    expect(() =>
      agentFeedbackReviewUrl(encodedReport({ schemaVersion: 4 }))
    ).toThrow('The report must use agent feedback schema version 5 or 6.')
  })

  it('rejects an incomplete schema version 5 report', () => {
    const incompleteReport = Buffer.from(
      JSON.stringify({ schemaVersion: 5 })
    ).toString('base64url')

    expect(() => agentFeedbackReviewUrl(incompleteReport)).toThrow(
      'The report must match agent feedback schema version 5.'
    )
  })

  it('rejects an incomplete schema version 6 report', () => {
    expect(() =>
      agentFeedbackReviewUrl(encodedReport({ schemaVersion: 6 }))
    ).toThrow('The report must match agent feedback schema version 6.')
  })
})

describe('openAgentFeedbackReviewForm', () => {
  const url = 'https://nextjs.org/agent-feedback#report=test'

  it.each([
    [
      'darwin',
      'open',
      [url],
      {
        detached: true,
        stdio: 'ignore',
      },
    ],
    [
      'linux',
      'xdg-open',
      [url],
      {
        detached: true,
        stdio: 'ignore',
      },
    ],
    [
      'win32',
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'start', '""', `"${url}"`],
      {
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true,
      },
    ],
  ] as const)(
    'uses the platform browser command on %s',
    async (platform, command, args, options) => {
      const child = new EventEmitter() as EventEmitter & {
        unref: jest.Mock
      }
      child.unref = jest.fn()
      const spawnReviewForm = jest.fn(() => child as never)
      const opened = openAgentFeedbackReviewForm(url, platform, spawnReviewForm)

      child.emit('spawn')
      await opened

      expect(spawnReviewForm).toHaveBeenCalledWith(command, args, options)
      expect(child.unref).toHaveBeenCalled()
    }
  )
})

describe('nextFeedback', () => {
  const originalExitCode = process.exitCode

  afterEach(() => {
    jest.useRealTimers()
    process.exitCode = originalExitCode
    jest.restoreAllMocks()
  })

  it('prints the fallback URL and opens the review form', async () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)
    const report = encodedReport()

    await nextFeedback(report, {}, openReviewForm)

    const url = `https://nextjs.org/agent-feedback#report=${report}`
    expect(write).toHaveBeenCalledWith(`${url}\n`)
    expect(openReviewForm).toHaveBeenCalledWith(url)
  })

  it('prints without opening in a dry run', async () => {
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)

    await nextFeedback(encodedReport(), { dryRun: true }, openReviewForm)

    expect(openReviewForm).not.toHaveBeenCalled()
  })

  it('reads the report from standard input when the argument is omitted', async () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)
    const report = encodedReport()
    const input = Readable.from([`${report}\n`])

    await nextFeedback(undefined, {}, openReviewForm, input)

    const url = `https://nextjs.org/agent-feedback#report=${report}`
    expect(write).toHaveBeenCalledWith(`${url}\n`)
    expect(openReviewForm).toHaveBeenCalledWith(url)
  })

  it('rejects an omitted report when standard input is interactive', async () => {
    const writeError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)
    const input = Object.assign(Readable.from([]), { isTTY: true })

    await nextFeedback(undefined, {}, openReviewForm, input)

    expect(writeError).toHaveBeenCalledWith(
      'Provide an agent feedback report as an argument or pipe it through standard input.\n'
    )
    expect(openReviewForm).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('rejects empty standard input', async () => {
    const writeError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)

    await nextFeedback(undefined, {}, openReviewForm, Readable.from([' \n']))

    expect(writeError).toHaveBeenCalledWith(
      'No agent feedback report was provided through standard input.\n'
    )
    expect(openReviewForm).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('rejects standard input that exceeds the size limit', async () => {
    const writeError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)

    await nextFeedback(
      undefined,
      {},
      openReviewForm,
      Readable.from(['x'.repeat(16 * 1024 + 1)])
    )

    expect(writeError).toHaveBeenCalledWith(
      'The agent feedback report must not exceed 16384 bytes.\n'
    )
    expect(openReviewForm).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('times out when standard input never finishes', async () => {
    jest.useFakeTimers()
    const writeError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)
    const input = new PassThrough()

    const feedback = nextFeedback(undefined, {}, openReviewForm, input)
    await jest.advanceTimersByTimeAsync(5_000)
    await feedback

    expect(writeError).toHaveBeenCalledWith(
      'Timed out waiting for the agent feedback report on standard input.\n'
    )
    expect(openReviewForm).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('keeps the printed URL usable when the browser cannot open', async () => {
    const writeError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await nextFeedback(encodedReport(), {}, async () => {
      throw new Error('browser unavailable')
    })

    expect(writeError).toHaveBeenCalledWith(
      'Unable to open the agent feedback review form. Use the URL printed above.\n'
    )
    expect(process.exitCode).toBe(originalExitCode)
  })

  it('rejects an invalid report without opening a browser', async () => {
    const writeError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const openReviewForm = jest.fn(async () => undefined)

    await nextFeedback('invalid+report', {}, openReviewForm)

    expect(writeError).toHaveBeenCalledWith(
      'The report must be unpadded base64url.\n'
    )
    expect(openReviewForm).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
