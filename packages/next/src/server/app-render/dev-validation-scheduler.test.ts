import {
  DevValidationScheduler,
  yieldToForegroundRequest,
} from './dev-validation-scheduler'

describe('dev validation scheduler', () => {
  it('supersedes validation from an older request in the same document', () => {
    const scheduler = new DevValidationScheduler(100, 2)
    const first = scheduler.begin('document-a')

    expect(first.signal.aborted).toBe(false)

    const second = scheduler.begin('document-a')

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    expect(scheduler.size).toBe(1)
  })

  it('does not supersede validation from another document', () => {
    const scheduler = new DevValidationScheduler(100, 2)
    const first = scheduler.begin('document-a')
    scheduler.begin('document-b')

    expect(first.signal.aborted).toBe(false)
    expect(scheduler.size).toBe(2)
  })

  it.each(['success', 'failure'])(
    'removes a generation after %s',
    (outcome) => {
      const scheduler = new DevValidationScheduler(100, 2)
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
    const scheduler = new DevValidationScheduler(100, 2)
    const first = scheduler.begin('document-a')
    const second = scheduler.begin('document-a')

    first.finish()

    expect(scheduler.size).toBe(1)
    expect(second.signal.aborted).toBe(false)

    second.finish()
    expect(scheduler.size).toBe(0)
  })

  it('bounds active validations and aborts the oldest generation', () => {
    const scheduler = new DevValidationScheduler(2, 2)
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
    const scheduler = new DevValidationScheduler(100, 2)
    const generations = Array.from({ length: 101 }, (_, index) =>
      scheduler.begin(`document-${index}`)
    )

    expect(generations[0].signal.aborted).toBe(true)
    expect(generations[1].signal.aborted).toBe(false)
    expect(scheduler.size).toBe(100)
  })

  it('observes supersession while yielding to incoming requests', async () => {
    const scheduler = new DevValidationScheduler(100, 2)
    const first = scheduler.begin('document-a')
    const canContinue = yieldToForegroundRequest(first.signal)

    scheduler.begin('document-a')

    await expect(canContinue).resolves.toBe(false)
  })

  it('admits generations up to the concurrency limit immediately', async () => {
    const scheduler = new DevValidationScheduler(100, 2)
    const first = scheduler.begin('document-a')
    const second = scheduler.begin('document-b')

    await expect(first.admit()).resolves.toBe(true)
    await expect(second.admit()).resolves.toBe(true)
    expect(scheduler.running).toBe(2)
  })

  it('queues admissions beyond the concurrency limit in FIFO order', async () => {
    const scheduler = new DevValidationScheduler(100, 1)
    const first = scheduler.begin('document-a')
    const second = scheduler.begin('document-b')
    const third = scheduler.begin('document-c')

    await expect(first.admit()).resolves.toBe(true)

    const admissionOrder: string[] = []
    const secondAdmitted = second.admit().then((admitted) => {
      admissionOrder.push('second')
      return admitted
    })
    const thirdAdmitted = third.admit().then((admitted) => {
      admissionOrder.push('third')
      return admitted
    })
    expect(scheduler.running).toBe(1)

    first.finish()
    await expect(secondAdmitted).resolves.toBe(true)
    expect(scheduler.running).toBe(1)

    second.finish()
    await expect(thirdAdmitted).resolves.toBe(true)
    expect(admissionOrder).toEqual(['second', 'third'])

    third.finish()
    expect(scheduler.running).toBe(0)
  })

  it('removes a queued admission when its generation is superseded', async () => {
    const scheduler = new DevValidationScheduler(100, 1)
    const first = scheduler.begin('document-a')
    const second = scheduler.begin('document-b')

    await expect(first.admit()).resolves.toBe(true)
    const secondAdmitted = second.admit()

    const replacement = scheduler.begin('document-b')

    await expect(secondAdmitted).resolves.toBe(false)
    expect(second.signal.aborted).toBe(true)

    // The superseded generation never took the slot; the replacement queues
    // for it.
    const replacementAdmitted = replacement.admit()
    first.finish()
    await expect(replacementAdmitted).resolves.toBe(true)

    replacement.finish()
    expect(scheduler.running).toBe(0)
  })

  it('does not admit an already-superseded generation', async () => {
    const scheduler = new DevValidationScheduler(100, 1)
    const first = scheduler.begin('document-a')
    scheduler.begin('document-a')

    await expect(first.admit()).resolves.toBe(false)
    expect(scheduler.running).toBe(0)
  })

  it('releases the slot of a superseded generation when it settles', async () => {
    const scheduler = new DevValidationScheduler(100, 1)
    const first = scheduler.begin('document-a')
    await expect(first.admit()).resolves.toBe(true)

    const second = scheduler.begin('document-b')
    const secondAdmitted = second.admit()

    // The running generation is superseded; its slot frees when it settles.
    scheduler.begin('document-a')
    expect(first.signal.aborted).toBe(true)
    first.finish()

    await expect(secondAdmitted).resolves.toBe(true)
    second.finish()
    expect(scheduler.running).toBe(0)
  })
})
