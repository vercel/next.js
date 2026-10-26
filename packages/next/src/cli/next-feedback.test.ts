import { EventEmitter } from 'events'

import {
  agentFeedbackReviewUrl,
  nextFeedback,
  openAgentFeedbackReviewForm,
} from './next-feedback'

function encodedReport(schemaVersion = 5) {
  return Buffer.from(JSON.stringify({ schemaVersion })).toString('base64url')
}

describe('agentFeedbackReviewUrl', () => {
  it('builds a review URL for a schema version 5 report', () => {
    const report = encodedReport()

    expect(agentFeedbackReviewUrl(report)).toBe(
      `https://nextjs.org/agent-feedback#report=${report}`
    )
  })

  it('rejects invalid and unsupported reports', () => {
    expect(() => agentFeedbackReviewUrl('not+base64')).toThrow(
      'The report must be unpadded base64url.'
    )
    expect(() => agentFeedbackReviewUrl(encodedReport(4))).toThrow(
      'The report must use agent feedback schema version 5.'
    )
  })
})

describe('openAgentFeedbackReviewForm', () => {
  it.each([
    ['darwin', 'open'],
    ['linux', 'xdg-open'],
    ['win32', process.env.ComSpec || 'cmd.exe'],
  ] as const)(
    'uses the platform browser command on %s',
    async (platform, command) => {
      const child = new EventEmitter() as EventEmitter & {
        unref: jest.Mock
      }
      child.unref = jest.fn()
      const spawnReviewForm = jest.fn(() => child as never)
      const opened = openAgentFeedbackReviewForm(
        'https://nextjs.org/agent-feedback#report=test',
        platform,
        spawnReviewForm
      )

      child.emit('spawn')
      await opened

      expect(spawnReviewForm).toHaveBeenCalledWith(command, expect.any(Array), {
        detached: true,
        stdio: 'ignore',
      })
      expect(child.unref).toHaveBeenCalled()
    }
  )
})

describe('nextFeedback', () => {
  const originalExitCode = process.exitCode

  afterEach(() => {
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
