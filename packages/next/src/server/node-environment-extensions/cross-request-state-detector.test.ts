import { AsyncLocalStorage } from 'node:async_hooks'
import {
  installCrossRequestStateDetector,
  type WorkUnitStoreLike,
} from './cross-request-state-detector'

type FakeStore = { type: string; url: { pathname: string } }

function setup() {
  const als = new AsyncLocalStorage<FakeStore>()
  const warnings: string[] = []
  const uninstall = installCrossRequestStateDetector({
    getStore: () => als.getStore() as WorkUnitStoreLike | undefined,
    warn: (m) => warnings.push(m),
  })
  // fresh object per request => distinct identity, like a real RequestStore
  const request = <T>(pathname: string, fn: () => Promise<T>): Promise<T> =>
    als.run({ type: 'request', url: { pathname } }, fn)
  return { warnings, uninstall, request }
}

async function fetchUserSidebar(user: string): Promise<string> {
  return `sidebar-data-for-${user}`
}

describe('cross-request state detector', () => {
  it('warns AND reproduces the leak: a module-scoped Map<useId, Promise>', async () => {
    const { warnings, uninstall, request } = setup()
    try {
      const sidebarPromises = new Map<string, Promise<string>>() // module scope
      const renderSidebar = (user: string) => {
        const id = '_r_0_' // deterministic useId(), identical across requests
        if (!sidebarPromises.has(id)) {
          sidebarPromises.set(id, fetchUserSidebar(user))
        }
        return sidebarPromises.get(id)!
      }

      const aliceSaw = await request('/chat/alice', () =>
        renderSidebar('alice')
      )
      const bobSaw = await request('/chat/bob', () => renderSidebar('bob'))

      expect(aliceSaw).toBe('sidebar-data-for-alice')
      // the actual production bug: bob is served alice's data
      expect(bobSaw).toBe('sidebar-data-for-alice')

      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('Cross-request state leak detected')
      expect(warnings[0]).toContain('/chat/alice')
      expect(warnings[0]).toContain('/chat/bob')
    } finally {
      uninstall()
    }
  })

  it('warns for a module-scoped WeakSet<Promise> observed across requests', async () => {
    const { warnings, uninstall, request } = setup()
    try {
      const consumed = new WeakSet<Promise<unknown>>() // module scope
      const shared = fetchUserSidebar('alice')
      await request('/chat/alice', async () => {
        consumed.add(shared)
      })
      const bobSawIt = await request('/chat/bob', async () =>
        consumed.has(shared)
      )
      expect(bobSawIt).toBe(true)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('WeakSet')
    } finally {
      uninstall()
    }
  })

  it('does not warn for a per-request container (React.cache-style)', async () => {
    const { warnings, uninstall, request } = setup()
    try {
      const renderScoped = (user: string) => {
        const cache = new Map<string, Promise<string>>() // per-request
        const id = '_r_0_'
        if (!cache.has(id)) cache.set(id, fetchUserSidebar(user))
        return cache.get(id)!
      }
      await request('/chat/alice', () => renderScoped('alice'))
      const bobSaw = await request('/chat/bob', () => renderScoped('bob'))
      expect(bobSaw).toBe('sidebar-data-for-bob')
      expect(warnings).toHaveLength(0)
    } finally {
      uninstall()
    }
  })

  it('does not warn for a module cache of plain (non-thenable) data', async () => {
    const { warnings, uninstall, request } = setup()
    try {
      const config = new Map<string, string>() // module scope
      config.set('theme', 'dark') // plain value, set at module load
      await request('/a', async () => config.get('theme'))
      await request('/b', async () => config.get('theme'))
      expect(warnings).toHaveLength(0)
    } finally {
      uninstall()
    }
  })

  it('does not warn when the same request reads its own promise twice', async () => {
    const { warnings, uninstall, request } = setup()
    try {
      const m = new Map<string, Promise<string>>()
      await request('/x', async () => {
        m.set('k', fetchUserSidebar('x'))
        await m.get('k')!
        await m.get('k')!
      })
      expect(warnings).toHaveLength(0)
    } finally {
      uninstall()
    }
  })
})
