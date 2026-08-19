import { createDevRouteChangeCoordinator } from '../../packages/next/src/server/lib/router-utils/dev-route-change-coordinator'

function createRecorder() {
  const changes: Array<{ added: string[]; removed: string[] }> = []
  return {
    changes,
    coordinator: createDevRouteChangeCoordinator((change) => {
      changes.push(change)
    }),
  }
}

describe('dev route change coordinator', () => {
  it('establishes startup state without announcing route changes', () => {
    const { coordinator, changes } = createRecorder()

    coordinator.updateWatchpack(['/watchpack'])
    coordinator.updateBundler(['/bundler'])

    expect(changes).toEqual([])
  })

  it('announces a bundler-only startup route when Watchpack catches up', () => {
    const { coordinator, changes } = createRecorder()

    coordinator.updateBundler(['/late'])
    coordinator.updateWatchpack([])
    expect(changes).toEqual([])

    coordinator.updateWatchpack(['/late'])
    expect(changes).toEqual([{ added: ['/late'], removed: [] }])
  })

  it('does not re-announce a Watchpack startup route when the bundler catches up', () => {
    const { coordinator, changes } = createRecorder()

    coordinator.updateWatchpack(['/visible'])
    coordinator.updateBundler([])
    expect(changes).toEqual([])

    coordinator.updateBundler(['/visible'])
    expect(changes).toEqual([])
  })

  it.each(['watchpack', 'bundler'] as const)(
    'waits for both producers before adding a route (%s first)',
    (first) => {
      const { coordinator, changes } = createRecorder()
      coordinator.updateWatchpack([])
      coordinator.updateBundler([])

      coordinator[first === 'watchpack' ? 'updateWatchpack' : 'updateBundler']([
        '/new',
      ])
      expect(changes).toEqual([])

      coordinator[first === 'watchpack' ? 'updateBundler' : 'updateWatchpack']([
        '/new',
      ])
      expect(changes).toEqual([{ added: ['/new'], removed: [] }])
    }
  )

  it.each(['watchpack', 'bundler'] as const)(
    'waits for both producers before removing a route (%s first)',
    (first) => {
      const { coordinator, changes } = createRecorder()
      coordinator.updateWatchpack(['/existing'])
      coordinator.updateBundler(['/existing'])

      coordinator[first === 'watchpack' ? 'updateWatchpack' : 'updateBundler'](
        []
      )
      expect(changes).toEqual([])

      coordinator[first === 'watchpack' ? 'updateBundler' : 'updateWatchpack'](
        []
      )
      expect(changes).toEqual([{ added: [], removed: ['/existing'] }])
    }
  )

  it.each(['watchpack', 'bundler'] as const)(
    'does not announce a transient route observed only by %s',
    (producer) => {
      const { coordinator, changes } = createRecorder()
      coordinator.updateWatchpack([])
      coordinator.updateBundler([])

      const update =
        producer === 'watchpack'
          ? coordinator.updateWatchpack
          : coordinator.updateBundler
      update(['/transient'])
      update([])

      expect(changes).toEqual([])
    }
  )
})
