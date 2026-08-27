import { type NextInstance, nextTestSetup, FileRef } from 'e2e-utils'
import { check } from 'next-test-utils'
import fs from 'fs'

const originalNextConfig = fs.readFileSync(
  __dirname + '/next.config.js',
  'utf8'
)
const importMetaResolveNextConfig = `export default {
  cacheHandler: import.meta.resolve('./cache-handler-esm.js'),
}`

function runTests(
  exportType: string,
  { next, isNextDev }: { next: NextInstance; isNextDev: boolean }
) {
  describe(exportType, () => {
    it('should have logs from cache-handler', async () => {
      if (isNextDev) {
        await next.fetch('/')
      }
      await check(() => {
        expect(next.cliOutput).toContain('cache handler - ' + exportType)
        expect(next.cliOutput).toContain('initialized custom cache-handler')
        expect(next.cliOutput).toContain('cache-handler get')
        expect(next.cliOutput).toContain('cache-handler set')
        return 'success'
      }, 'success')
    })
  })
}

describe('app-dir - custom-cache-handler - cjs', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // It likely asserts local CLI or runtime output that deploy tests do not expose.
    skipDeployment: true,
    env: {
      CUSTOM_CACHE_HANDLER: 'cache-handler.js',
    },
  })

  if (skipped) {
    return
  }

  runTests('cjs module exports', { next, isNextDev })
})

describe('app-dir - custom-cache-handler - cjs-default-export', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // It likely asserts local CLI or runtime output that deploy tests do not expose.
    skipDeployment: true,
    env: {
      CUSTOM_CACHE_HANDLER: 'cache-handler-cjs-default-export.js',
    },
  })

  if (skipped) {
    return
  }

  runTests('cjs default export', { next, isNextDev })
})

describe('app-dir - custom-cache-handler - esm', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: {
      app: new FileRef(__dirname + '/app'),
      'cache-handler-esm.js': new FileRef(__dirname + '/cache-handler-esm.js'),
      'next.config.js': originalNextConfig.replace(
        'module.exports = ',
        'export default '
      ),
    },
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // It likely asserts local CLI or runtime output that deploy tests do not expose.
    skipDeployment: true,
    packageJson: {
      type: 'module',
    },
    env: {
      CUSTOM_CACHE_HANDLER: 'cache-handler-esm.js',
    },
  })

  if (skipped) {
    return
  }

  runTests('esm default export', { next, isNextDev })
})

describe('app-dir - custom-cache-handler - esm import.meta.resolve', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: {
      app: new FileRef(__dirname + '/app'),
      'cache-handler-esm.js': new FileRef(__dirname + '/cache-handler-esm.js'),
      'next.config.js': importMetaResolveNextConfig,
    },
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // It likely asserts local CLI or runtime output that deploy tests do not expose.
    skipDeployment: true,
    packageJson: {
      type: 'module',
    },
  })

  if (skipped) {
    return
  }

  runTests('esm default export', { next, isNextDev })
})
