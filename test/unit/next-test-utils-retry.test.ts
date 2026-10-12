import { retry, waitFor } from 'next-test-utils'

describe('retry', () => {
  it('returns the first successful result', async () => {
    let attempts = 0
    const result = await retry(
      () => {
        attempts++
        if (attempts < 3) {
          throw new Error('not yet')
        }
        return 'done'
      },
      3000,
      10
    )
    expect(result).toBe('done')
    expect(attempts).toBe(3)
  })

  it('stops once the duration is spent when attempts are slower than the interval', async () => {
    const started = Date.now()
    let attempts = 0
    await expect(
      retry(
        async () => {
          attempts++
          await waitFor(1000)
          throw new Error('never succeeds')
        },
        2000,
        500
      )
    ).rejects.toThrow('never succeeds')
    const elapsed = Date.now() - started
    expect(elapsed).toBeLessThan(4000)
    expect(attempts).toBeLessThanOrEqual(3)
  })

  it('takes an interval that does not divide the duration', async () => {
    await expect(
      retry(
        () => {
          throw new Error('nope')
        },
        1000,
        300
      )
    ).rejects.toThrow('nope')
  })

  it('rejects a negative duration', async () => {
    await expect(retry(() => 'done', -1000)).rejects.toThrow(
      'Duration cannot be less than 0.'
    )
  })

  it('always makes at least one attempt', async () => {
    let attempts = 0
    await expect(
      retry(
        () => {
          attempts++
          throw new Error('nope')
        },
        0,
        500
      )
    ).rejects.toThrow('nope')
    expect(attempts).toBe(1)
  })
})
