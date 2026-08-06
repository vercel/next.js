import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const EXPECTED_WARNING =
  'The "preferredRegion" route segment config is deprecated.'

describe('preferred-region-deprecated', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should warn about deprecated preferredRegion', async () => {
    await retry(async () => {
      expect(next.cliOutput).toContain(EXPECTED_WARNING)
    })
  })

  it('should only warn once', async () => {
    await retry(async () => {
      expect(next.cliOutput).toContain(EXPECTED_WARNING)
    })

    const occurrences = next.cliOutput.split(EXPECTED_WARNING).length - 1
    expect(occurrences).toBe(1)
  })
})
