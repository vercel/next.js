import { nextBuild } from 'next-test-utils'

describe('worker-restart', () => {
  it('should properly exhaust all restart attempts and not fail with any worker errors', async () => {
    const { stdout, stderr } = await nextBuild(
      __dirname + '/fixtures/timeout',
      [],
      {
        stdout: true,
        stderr: true,
      }
    )

    const output = stdout + stderr
    expect(output).toContain(
      'Failed to build /bad-page/page: /bad-page (attempt 1 of 3) because it took more than 10 seconds. Retrying again shortly.'
    )
    expect(output).toContain(
      'Failed to build /bad-page/page: /bad-page (attempt 2 of 3) because it took more than 10 seconds. Retrying again shortly.'
    )
    expect(output).toContain(
      'Failed to build /bad-page/page: /bad-page after 3 attempts'
    )
    expect(output).not.toContain(
      'Error: Farm is ended, no more calls can be done to it'
    )
  })

  it('should support configurable static generation retries', async () => {
    const { stdout, stderr } = await nextBuild(
      __dirname + '/fixtures/retries',
      [],
      {
        stdout: true,
        stderr: true,
      }
    )

    const output = stdout + stderr
    expect(output).toContain('This page is bad!')
    expect(output).toContain(
      'Failed to build /page: / (attempt 2 of 3). Retrying again shortly.'
    )
    expect(output).toContain('Failed to build /page: / after 3 attempts.')
  })
})
