import { getCacheInvalidationListenerCount } from './require-cache'
import { installUseCacheProbe } from './use-cache-probe-pool'
import { installDevValidationWorker } from './dev-validation-worker-pool'
import { getUseCacheProbe } from '../use-cache/use-cache-probe-globals'
import { getDevValidationWorker } from '../app-render/dev-validation-worker-globals'

const options = {
  distDir: '/tmp/next-cache-invalidation-test/.next',
  buildId: 'test-build-id',
  deploymentId: '',
  nextConfig: {} as any,
}

describe('dev worker-pool installation teardown', () => {
  it('use-cache probe unsubscribes and resets the global hook on teardown', async () => {
    const before = getCacheInvalidationListenerCount()
    const uninstall = installUseCacheProbe(options)
    expect(getCacheInvalidationListenerCount()).toBe(before + 1)
    expect(getUseCacheProbe()).toBeDefined()

    await uninstall()
    expect(getCacheInvalidationListenerCount()).toBe(before)
    expect(getUseCacheProbe()).toBeUndefined()
  })

  it('dev validation worker unsubscribes and resets the global hook on teardown', async () => {
    const before = getCacheInvalidationListenerCount()
    const uninstall = installDevValidationWorker(options)
    expect(getCacheInvalidationListenerCount()).toBe(before + 1)
    expect(getDevValidationWorker()).toBeDefined()

    await uninstall()
    expect(getCacheInvalidationListenerCount()).toBe(before)
    expect(getDevValidationWorker()).toBeUndefined()
  })

  it('repeated install/teardown cycles do not accumulate listeners', async () => {
    const before = getCacheInvalidationListenerCount()
    for (let i = 0; i < 5; i++) {
      await installUseCacheProbe(options)()
      await installDevValidationWorker(options)()
    }
    expect(getCacheInvalidationListenerCount()).toBe(before)
  })
})
