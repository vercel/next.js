import {
  latchServerCleanupExitCode,
  runServerCleanupPhases,
  scheduleServerCleanup,
} from 'next/dist/server/lib/server-cleanup'

describe('server process cleanup phases', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('schedules cleanup after the owner returns and observes rejection', async () => {
    jest.useFakeTimers()
    const failure = new Error('scheduled cleanup failed')
    const cleanup = jest.fn(async () => {
      throw failure
    })
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    scheduleServerCleanup(cleanup)
    expect(cleanup).not.toHaveBeenCalled()

    jest.runOnlyPendingTimers()
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(failure)
  })

  it('lets a termination signal override an in-flight restart', () => {
    let exitCode = latchServerCleanupExitCode(undefined, 77)
    exitCode = latchServerCleanupExitCode(exitCode, 143)
    exitCode = latchServerCleanupExitCode(exitCode, 77)

    expect(exitCode).toBe(143)
  })

  it('attempts every stage and phase with deterministic diagnostics', async () => {
    const firstFailure = new Error('first phase failed')
    const secondFailure = new Error('second phase failed')
    const events: string[] = []
    let finishParallelStage!: () => void

    const cleanup = runServerCleanupPhases(
      [
        [
          () => {
            events.push('phase-1:first')
            throw firstFailure
          },
          () =>
            new Promise<void>((resolve) => {
              events.push('phase-1:parallel')
              finishParallelStage = resolve
            }),
        ],
        [
          () => {
            events.push('phase-2')
            throw secondFailure
          },
        ],
        [
          () => {
            events.push('phase-3')
          },
        ],
      ],
      (error) => events.push(`failure:${(error as Error).message}`)
    )

    await Promise.resolve()
    expect(events).toEqual(['phase-1:first', 'phase-1:parallel'])
    finishParallelStage()
    await cleanup

    expect(events).toEqual([
      'phase-1:first',
      'phase-1:parallel',
      'failure:first phase failed',
      'phase-2',
      'failure:second phase failed',
      'phase-3',
    ])
  })

  it('keeps cleaning up when the diagnostic sink throws', async () => {
    const laterStage = jest.fn()

    await expect(
      runServerCleanupPhases(
        [[() => Promise.reject(new Error('cleanup failed'))], [laterStage]],
        () => {
          throw new Error('diagnostic failed')
        }
      )
    ).resolves.toBeUndefined()
    expect(laterStage).toHaveBeenCalledTimes(1)
  })
})
