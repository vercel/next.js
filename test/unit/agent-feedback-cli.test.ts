import { createAgentFeedbackUrl } from '../../packages/next/src/cli/next-agent-feedback'

describe('createAgentFeedbackUrl', () => {
  it('encodes the report for the feedback page', () => {
    const url = new URL(
      createAgentFeedbackUrl('  Unicode works: café ☕  ', {
        nextVersion: '16.3.1-canary.19',
        agent: 'Codex',
      })!
    )
    const report = new URLSearchParams(url.hash.slice(1)).get('report')

    expect(url.origin + url.pathname).toBe('https://nextjs.org/agent-feedback')
    expect(
      JSON.parse(Buffer.from(report!, 'base64url').toString('utf8'))
    ).toEqual({
      feedback: 'Unicode works: café ☕',
      nextVersion: '16.3.1-canary.19',
      agent: 'Codex',
    })
  })

  it('rejects invalid feedback', () => {
    expect(createAgentFeedbackUrl(' ')).toBeUndefined()
    expect(createAgentFeedbackUrl('a'.repeat(2001))).toBeUndefined()
  })
})
