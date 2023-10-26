import { nextBuild } from 'next-test-utils'

describe('ppr build errors', () => {
  it('should fail the build', async () => {
    const out = await nextBuild(__dirname, [], { stderr: true })
    expect(out.stderr).toContain(
      'Postpone signal was caught while rendering /. These errors should not be caught during static generation.'
    )
  })
})
