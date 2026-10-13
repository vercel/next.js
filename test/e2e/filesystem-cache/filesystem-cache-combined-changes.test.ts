import {
  CHANGE_NAMES,
  setupFilesystemCacheTest,
} from './filesystem-cache-helpers'

for (const cacheEnabled of [false, true]) {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely mutates files in the isolated local fixture after setup.
  // @force-gate !deploy
  describe(`filesystem-caching with cache ${cacheEnabled ? 'enabled' : 'disabled'}`, () => {
    const { testChangesWhileStopped } = setupFilesystemCacheTest(cacheEnabled)

    // Applies every change at once. Each change is also tested on its own in
    // filesystem-cache-app-changes.test.ts and
    // filesystem-cache-config-changes.test.ts.
    testChangesWhileStopped(CHANGE_NAMES)
  })
}
