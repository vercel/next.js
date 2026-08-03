import {
  DevValidationScheduler,
  yieldToForegroundRequest,
} from './dev-validation-scheduler'

describe('dev validation scheduler', () => {
  it('supersedes validation from an older request in the same document', () => {
    const scheduler = new DevValidationScheduler(100)
    const first = scheduler.begin('document-a')

    expect(first.signal.aborted).toBe(false)

    const second = scheduler.begin('document-a')

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    expect(scheduler.size).toBe(1)
  })

  it('does not supersede validation from another document', () => {
    const scheduler = new DevValidationScheduler(100)
    const first = scheduler.begin('document-a')
    scheduler.begin('document-b')

    expect(first.signal.aborted).toBe(false)
    expect(scheduler.size).toBe(2)
  })

  it.each(['success', 'failure'])(
    'removes a generation after %s',
    (outcome) => {
      const scheduler = new DevValidationScheduler(100)
      const generation = scheduler.begin('document-a')

      try {
        if (outcome === 'failure') {
          throw new Error('validation failed')
        }
      } catch {
        // Validation failures use the same terminal cleanup callback.
      } finally {
        generation.finish()
      }

      expect(generation.signal.aborted).toBe(false)
      expect(scheduler.size).toBe(0)
    }
  )

  it('does not let stale cleanup remove a replacement generation', () => {
    const scheduler = new DevValidationScheduler(100)
    const first = scheduler.begin('document-a')
    const second = scheduler.begin('document-a')

    first.finish()

    expect(scheduler.size).toBe(1)
    expect(second.signal.aborted).toBe(false)

    second.finish()
    expect(scheduler.size).toBe(0)
  })

  it('bounds active validations and aborts the oldest generation', () => {
    const scheduler = new DevValidationScheduler(2)
    const first = scheduler.begin('document-a')
    const second = scheduler.begin('document-b')
    const third = scheduler.begin('document-c')

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    expect(third.signal.aborted).toBe(false)
    expect(scheduler.size).toBe(2)

    first.finish()
    second.finish()
    third.finish()
    expect(scheduler.size).toBe(0)
  })

  it('remains bounded after more than 100 unique documents', () => {
    const scheduler = new DevValidationScheduler(100)
    const generations = Array.from({ length: 101 }, (_, index) =>
      scheduler.begin(`document-${index}`)
    )

    expect(generations[0].signal.aborted).toBe(true)
    expect(generations[1].signal.aborted).toBe(false)
    expect(scheduler.size).toBe(100)
  })

  it('observes supersession while yielding to incoming requests', async () => {
    const scheduler = new DevValidationScheduler(100)
    const first = scheduler.begin('document-a')
    const canContinue = yieldToForegroundRequest(first.signal)

    scheduler.begin('document-a')

    await expect(canContinue).resolves.toBe(false)
  })
})
