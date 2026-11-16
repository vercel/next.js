import { setupFilesystemCacheTest } from './filesystem-cache-helpers'

for (const cacheEnabled of [false, true]) {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely mutates files in the isolated local fixture after setup.
  // @force-gate !deploy
  describe(`filesystem-caching with cache ${cacheEnabled ? 'enabled' : 'disabled'}`, () => {
    const { testChangesWhileStopped } = setupFilesystemCacheTest(cacheEnabled)

    if (!process.env.IS_TURBOPACK_TEST) {
      // TODO enable again
      testChangesWhileStopped(['loader change'])
    }
    testChangesWhileStopped(['next config change'])
    testChangesWhileStopped(['env var change'])
  })
}
