import { nextBuild } from 'next-test-utils'

describe('required-env', () => {
  it('should only log app routes', async () => {
    let result = { code: 0, stderr: '' }
    result = await nextBuild(__dirname, [], { stderr: true })

    expect(result.code).toBe(1)

    expect(result.stderr).toContain('Missing required environment variables')
    expect(result.stderr).toContain('MISSING_ENV')
    expect(result.stderr).not.toContain('REQUIRED_ENV_1')
    expect(result.stderr).not.toContain('REQUIRED_ENV_2')
  })
})
