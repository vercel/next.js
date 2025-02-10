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
      'Sending SIGTERM signal to Next.js build worker due to timeout of 10 seconds. Subsequent errors may be a result of the worker exiting.'
    )
    expect(output).toContain(
      'Next.js build worker exited with code: null and signal: SIGTERM'
    )
    expect(output).toContain(
      'Restarted static page generation for /bad-page because it took more than 10 seconds'
    )
    expect(output).toContain(
      'Static page generation for /bad-page is still timing out after 3 attempts'
    )
    expect(output).not.toContain(
      'Error: Farm is ended, no more calls can be done to it'
    )
  })

  it('should fail the build if a worker process is killed', async () => {
    const { stdout, stderr } = await nextBuild(
      __dirname + '/fixtures/worker-kill',
      [],
      {
        stdout: true,
        stderr: true,
      }
    )

    const output = stdout + stderr
    expect(output).toContain(
      'Next.js build worker exited with code: null and signal: SIGKILL'
    )
  })
})
