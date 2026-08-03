import type { Response } from 'node-fetch'
import { join } from 'path'
import { nextTestSetup, FileRef } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-hmr', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // Server HMR is a Turbopack-only feature, only available in dev mode
  const itTurbopackDev = isTurbopack && isNextDev ? it : it.skip

  describe('module preservation', () => {
    itTurbopackDev(
      'does not compile a changed server module until the next request',
      async () => {
        await next.deleteFile('lazy-rebuild-probe.log').catch(() => {})

        const browser = await next.browser('/lazy-rebuild')
        await retry(async () => {
          expect(await browser.elementByCss('#value').text()).toBe('initial')
        })

        await browser.eval(() => {
          const originalFetch = window.fetch
          window.fetch = (input, init) => {
            const headers = new Headers(init?.headers)
            if (headers.get('next-hmr-refresh') === '1') {
              return new Promise(() => {})
            }
            return originalFetch(input, init)
          }
        })

        const initialCompileLog = await next.readFile('lazy-rebuild-probe.log')

        await next.patchFile('app/lazy-rebuild/probe.js', (content) =>
          content.replace(
            "export const value = 'initial'",
            "export const value = 'updated'"
          )
        )

        await retry(async () => {
          expect(await next.readFile('lazy-rebuild-probe.log')).toBe(
            initialCompileLog
          )
        })

        expect(await (await next.fetch('/lazy-rebuild')).text()).toContain(
          'updated'
        )
        expect(await next.readFile('lazy-rebuild-probe.log')).not.toBe(
          initialCompileLog
        )
      }
    )

    itTurbopackDev(
      'does not re-evaluate an unmodified module when page module changes',
      async () => {
        const browser = await next.browser('/module-preservation')

        // Wait for initial render with module timestamp
        await retry(async () => {
          const text = await browser.elementByCss('#module-eval-time').text()
          expect(text).toMatch(/Module Evaluated At: \d+/)
        })

        // Capture the initial module evaluation timestamp
        const initialModuleEvalTime = await browser
          .elementByCss('#module-eval-time')
          .text()

        // Make a change to the page that doesn't affect the unmodified module
        await next.patchFile('app/module-preservation/page.tsx', (content) =>
          content.replace('hello world', 'hello universe')
        )

        // Wait for HMR to apply and verify the page updated
        await retry(async () => {
          const text = await browser.elementByCss('#greeting').text()
          expect(text).toBe('hello universe')
        })

        // The unmodified module should NOT have been re-evaluated (same timestamp)
        const newModuleEvalTime = await browser
          .elementByCss('#module-eval-time')
          .text()
        expect(newModuleEvalTime).toBe(initialModuleEvalTime)
      }
    )

    itTurbopackDev(
      're-evaluates a module when the module itself changes',
      async () => {
        const browser = await next.browser('/module-preservation')

        // Wait for initial render
        await retry(async () => {
          const text = await browser.elementByCss('#module-eval-time').text()
          expect(text).toMatch(/Module Evaluated At: \d+/)
        })

        // Capture the initial module evaluation timestamp
        const initialModuleEvalTime = await browser
          .elementByCss('#module-eval-time')
          .text()

        // Make a change to the module itself to trigger re-evaluation
        await next.patchFile('app/unmodified-module.ts', (content) =>
          content.replace('_hmrTrigger = 0', '_hmrTrigger = 1')
        )

        // Wait for HMR to apply - the module should be re-evaluated
        // and the timestamp should change
        await retry(async () => {
          // Refresh to trigger re-evaluation of changed modules
          await browser.refresh()
          const newModuleEvalTime = await browser
            .elementByCss('#module-eval-time')
            .text()
          expect(newModuleEvalTime).not.toBe(initialModuleEvalTime)
        })
      }
    )
  })

  describe('child module accept', () => {
    itTurbopackDev(
      'allows child modules to accept hot updates using module.hot.accept',
      async () => {
        const browser = await next.browser('/child-accept')

        // Wait for initial render
        await retry(async () => {
          const text = await browser.elementByCss('#message').text()
          expect(text).toBe('Initial message')
        })

        const initialEvalTime = await browser.elementByCss('#eval-time').text()
        expect(initialEvalTime).toMatch(/Module evaluated at: \d+/)

        // Make a change to the child module
        // The child module calls module.hot.accept(), which allows it to
        // accept updates. While pages auto-accept at the top level in server HMR,
        // this test verifies that module.hot.accept() is available and functional
        // in non-page, user-authored child modules.
        await next.patchFile('app/child-module.ts', (content) =>
          content.replace('Initial message', 'Updated message')
        )

        // Wait for HMR to apply - the child module should accept the update
        await retry(async () => {
          const text = await browser.elementByCss('#message').text()
          expect(text).toBe('Updated message')
        })

        // The module should have been re-evaluated (new timestamp)
        const newEvalTime = await browser.elementByCss('#eval-time').text()
        expect(newEvalTime).not.toBe(initialEvalTime)

        // Apply another update to verify the module continues to accept updates
        await next.patchFile('app/child-module.ts', (content) =>
          content.replace('Updated message', 'Second update')
        )

        await retry(async () => {
          const text = await browser.elementByCss('#message').text()
          expect(text).toBe('Second update')
        })
      }
    )
  })

  describe('new import', () => {
    itTurbopackDev(
      'does not re-evaluate unmodified dependencies when adding a new import',
      async () => {
        const browser = await next.browser('/new-import')

        await retry(async () => {
          const text = await browser.elementByCss('#greeting').text()
          expect(text).toBe('hello world')
        })

        const initialDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()

        // Add a new import from a file that wasn't previously in the module
        // graph. Entry chunks (page.js) are CJS; without a VersionedContent
        // impl they produce `restart` updates from Turbopack, causing clear()
        // to wipe require.cache and re-evaluate every server module.
        await next.patchFile('app/new-import/page.tsx', (content) => {
          return content
            .replace(
              'export default function Page() {',
              "import { newModuleValue } from './new-module'\n\nexport default function Page() {"
            )
            .replace(
              '<p id="new-module-value">not imported yet</p>',
              '<p id="new-module-value">{newModuleValue}</p>'
            )
        })

        await retry(async () => {
          const text = await browser.elementByCss('#new-module-value').text()
          expect(text).toBe('from-new-module')
        })

        // clear() re-evaluates every server module, which would change
        // depEvalTime. A partial HMR apply only re-evaluates the modified page
        // module, leaving the unmodified dependency untouched.
        const newDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()
        expect(newDepEvalTime).toBe(initialDepEvalTime)

        await next.patchFile('app/new-import/page.tsx', (content) => {
          return content
            .replace(
              "import { newModuleValue } from './new-module'\n\nexport default function Page() {",
              'export default function Page() {'
            )
            .replace(
              '<p id="new-module-value">{newModuleValue}</p>',
              '<p id="new-module-value">not imported yet</p>'
            )
        })

        await retry(async () => {
          const text = await browser.elementByCss('#new-module-value').text()
          expect(text).toBe('not imported yet')
        })
      }
    )
  })

  describe('dynamic import', () => {
    // A change to a server-side dynamically-imported module renames its chunk
    // (content hash) under server/chunks/. That chunk is not part of the entry
    // chunk's *synchronous* chunk list, so this exercises a different path than
    // the entry-chunk "new import" case above.
    //
    // Two properties are guarded:
    //   1. The change is hot-reflected: the dynamic chunk is reachable through
    //      the entry's async-loader references, which are expanded into the
    //      tracked chunk list, so the module delta rides the merged
    //      ChunkListUpdate and the module is re-instantiated.
    //   2. No restart → clear(): the unmodified synchronous dependency keeps its
    //      evaluation timestamp (detected via dep.ts).
    itTurbopackDev(
      'reflects changes to a dynamically-imported module without clear()',
      async () => {
        const browser = await next.browser('/dynamic-import')

        await retry(async () => {
          const text = await browser.elementByCss('#lazy-value').text()
          expect(text).toBe('lazy-v0')
        })

        const initialDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()

        await next.patchFile('app/dynamic-import/lazy.ts', (content) =>
          content.replace('lazy-v0', 'lazy-v1')
        )

        // The dynamic import value is hot-updated on the server.
        await retry(async () => {
          const fresh = await next
            .fetch('/dynamic-import')
            .then((r) => r.text())
          expect(fresh).toContain('lazy-v1')
        })

        // No clear() fired: the unmodified synchronous dependency keeps its
        // original evaluation timestamp across the update.
        await browser.refresh()
        const newDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()
        expect(newDepEvalTime).toBe(initialDepEvalTime)

        await next.patchFile('app/dynamic-import/lazy.ts', (content) =>
          content.replace('lazy-v1', 'lazy-v0')
        )

        await retry(async () => {
          const fresh = await next
            .fetch('/dynamic-import')
            .then((r) => r.text())
          expect(fresh).toContain('lazy-v0')
        })
      }
    )

    itTurbopackDev(
      'reflects a new import added to a dynamically-imported module without clear()',
      async () => {
        const browser = await next.browser('/dynamic-import')

        await retry(async () => {
          const text = await browser.elementByCss('#lazy-value').text()
          expect(text).toBe('lazy-v0')
        })

        const initialDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()

        // Add a brand-new module to the dynamically-imported chunk's graph. This
        // changes the dynamic chunk's availability info / content hash, renaming
        // it. This is the dynamic-import analogue of the entry-chunk "new import"
        // case: the new value must be reflected without a restart → clear().
        await next.patchFile('app/dynamic-import/lazy.ts', (content) =>
          content.replace(
            "export const lazyValue = 'lazy-v0'",
            "import { lazyNewModuleValue } from './lazy-new-module'\n\nexport const lazyValue = lazyNewModuleValue"
          )
        )

        await retry(async () => {
          const fresh = await next
            .fetch('/dynamic-import')
            .then((r) => r.text())
          expect(fresh).toContain('from-lazy-new-module')
        })

        // No clear() fired: the unmodified synchronous dependency keeps its
        // original evaluation timestamp across the update.
        await browser.refresh()
        const newDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()
        expect(newDepEvalTime).toBe(initialDepEvalTime)

        await next.patchFile('app/dynamic-import/lazy.ts', (content) =>
          content.replace(
            "import { lazyNewModuleValue } from './lazy-new-module'\n\nexport const lazyValue = lazyNewModuleValue",
            "export const lazyValue = 'lazy-v0'"
          )
        )

        await retry(async () => {
          const fresh = await next
            .fetch('/dynamic-import')
            .then((r) => r.text())
          expect(fresh).toContain('lazy-v0')
        })
      }
    )
  })

  describe('client component hmr', () => {
    itTurbopackDev(
      'does not clear() when adding a new client component import',
      async () => {
        const browser = await next.browser('/client-component-hmr')

        await retry(async () => {
          const text = await browser.elementByCss('#greeting').text()
          expect(text).toBe('hello world')
        })

        const initialDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()

        // Add a new client component import. This changes the client-reference
        // manifest and can cause chunk renames. Without filtering manifest
        // chunks from HMR subscriptions, this triggers a spurious restart →
        // clear() that wipes require.cache and re-evaluates all server modules.
        await next.patchFile('app/client-component-hmr/page.tsx', (content) => {
          return content
            .replace(
              'export default function Page() {',
              "import { ClientGreeting } from './ClientGreeting'\n\nexport default function Page() {"
            )
            .replace(
              '<p id="client-component">not imported yet</p>',
              '<ClientGreeting text="from-client" />'
            )
        })

        await retry(async () => {
          const text = await browser.elementByCss('#client-greeting').text()
          expect(text).toBe('from-client')
        })

        // clear() would re-evaluate dep.ts and change its timestamp.
        // A partial HMR apply leaves unmodified server modules untouched.
        const newDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()
        expect(newDepEvalTime).toBe(initialDepEvalTime)

        await next.patchFile('app/client-component-hmr/page.tsx', (content) => {
          return content
            .replace(
              "import { ClientGreeting } from './ClientGreeting'\n\nexport default function Page() {",
              'export default function Page() {'
            )
            .replace(
              '<ClientGreeting text="from-client" />',
              '<p id="client-component">not imported yet</p>'
            )
        })

        await retry(async () => {
          const text = await browser.elementByCss('#client-component').text()
          expect(text).toBe('not imported yet')
        })
      }
    )

    itTurbopackDev(
      'preserves server module state across multiple client component changes',
      async () => {
        const browser = await next.browser('/client-component-hmr')

        await retry(async () => {
          const text = await browser.elementByCss('#greeting').text()
          expect(text).toBe('hello world')
        })

        const initialDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()

        await next.patchFile('app/client-component-hmr/page.tsx', (content) => {
          return content
            .replace(
              'export default function Page() {',
              "import { ClientGreeting } from './ClientGreeting'\n\nexport default function Page() {"
            )
            .replace(
              '<p id="client-component">not imported yet</p>',
              '<ClientGreeting text="first" />'
            )
        })

        await retry(async () => {
          const text = await browser.elementByCss('#client-greeting').text()
          expect(text).toBe('first')
        })

        await next.patchFile('app/client-component-hmr/page.tsx', (content) => {
          return content.replace(
            '<ClientGreeting text="first" />',
            '<ClientGreeting text="second" />'
          )
        })

        await retry(async () => {
          const text = await browser.elementByCss('#client-greeting').text()
          expect(text).toBe('second')
        })

        // dep.ts should still have its original timestamp — no clear() fired
        // across either change.
        const newDepEvalTime = await browser
          .elementByCss('#dep-eval-time')
          .text()
        expect(newDepEvalTime).toBe(initialDepEvalTime)

        await next.patchFile('app/client-component-hmr/page.tsx', (content) => {
          return content
            .replace(
              "import { ClientGreeting } from './ClientGreeting'\n\nexport default function Page() {",
              'export default function Page() {'
            )
            .replace(
              '<ClientGreeting text="second" />',
              '<p id="client-component">not imported yet</p>'
            )
        })

        await retry(async () => {
          const text = await browser.elementByCss('#client-component').text()
          expect(text).toBe('not imported yet')
        })
      }
    )
  })

  describe('source maps', () => {
    itTurbopackDev(
      "stack frames from eval'd HMR modules point to original source locations",
      async () => {
        await next.fetch('/sourcemaps').catch(() => {})

        await next.patchFile('app/sourcemaps/page.tsx', (content) =>
          content.replace('hmr-trigger: 0', 'hmr-trigger: 1')
        )

        const outputLengthBeforeFetch = next.cliOutput.length
        await next.fetch('/sourcemaps').catch(() => {})

        await retry(async () => {
          expect(next.cliOutput.slice(outputLengthBeforeFetch)).toContain(
            'hmr-sourcemap-test-error'
          )
        })

        const outputAfterHmr = next.cliOutput.slice(outputLengthBeforeFetch)

        // Without proper sourcemaps, the stack frame doesn't include the accurate file number
        expect(outputAfterHmr).toMatch(/page\.tsx:4:9/)
      }
    )
  })

  describe('metadata route hmr', () => {
    itTurbopackDev(
      'does not prevent page hmr when metadata route has been loaded',
      async () => {
        // Load the manifest route first. This causes the manifest runtime to
        // register its __turbopack_server_hmr_apply__ on globalThis, which
        // would overwrite the page's handler if the multi-cast registry is
        // broken.
        await next.fetch('/manifest.webmanifest')

        const browser = await next.browser('/module-preservation')

        // Patch the page to a known unique string regardless of prior test state
        await next.patchFile('app/module-preservation/page.tsx', (content) =>
          content.replace(/<p id="greeting">.*?<\/p>/, () => {
            return '<p id="greeting">metadata-hmr-test-initial</p>'
          })
        )

        await retry(async () => {
          const text = await browser.elementByCss('#greeting').text()
          expect(text).toBe('metadata-hmr-test-initial')
        })

        await next.patchFile('app/module-preservation/page.tsx', (content) =>
          content.replace(
            'metadata-hmr-test-initial',
            'metadata-hmr-test-updated'
          )
        )

        await retry(async () => {
          const text = await browser.elementByCss('#greeting').text()
          expect(text).toBe('metadata-hmr-test-updated')
        })
      }
    )

    it('reflects manifest dep changes on fetch/refresh', async () => {
      const initial = await next
        .fetch('/manifest.webmanifest')
        .then((res) => res.json())
      expect(initial.name).toBe('Version 0')

      await next.patchFile('app/manifest-dep.ts', (content) =>
        content.replace('Version 0', 'Version 1')
      )

      await retry(async () => {
        const updated = await next
          .fetch('/manifest.webmanifest')
          .then((res) => res.json())
        expect(updated.name).toBe('Version 1')
      })
    })

    itTurbopackDev(
      'does not re-evaluate an unmodified dep when manifest changes',
      async () => {
        const initial = await next
          .fetch('/manifest.webmanifest')
          .then((res) => res.json())
        const initialDepEvaluatedAt = initial.depEvaluatedAt

        // Patch manifest.ts itself, not the dep module
        await next.patchFile('app/manifest.ts', (content) =>
          content.replace('_hmrTrigger = 0', '_hmrTrigger = 1')
        )

        await retry(async () => {
          const updated = await next
            .fetch('/manifest.webmanifest')
            .then((res) => res.json())
          // manifest.ts should have been re-evaluated (new timestamp)
          expect(updated.manifestEvaluatedAt).not.toBe(
            initial.manifestEvaluatedAt
          )
          // manifest-dep.ts should NOT have been re-evaluated
          expect(updated.depEvaluatedAt).toBe(initialDepEvaluatedAt)
        })
      }
    )
  })

  describe('route handler hmr', () => {
    function getText(res: Response) {
      return res.ok
        ? res.text()
        : Promise.reject(
            new Error('Failed to fetch route handler: ' + res.status)
          )
    }

    it('reflects route handler changes on fetch/refresh', async () => {
      const initial = await next.fetch('/api/hello').then(getText)
      expect(initial).toBe('version: 0')

      await next.patchFile('app/api/hello/route.ts', (content) =>
        content.replace('version: 0', 'version: 1')
      )

      await retry(async () => {
        const updated = await next.fetch('/api/hello').then(getText)
        expect(updated).toBe('version: 1')
      })
    })

    itTurbopackDev(
      'does not re-evaluate an unmodified dependency when route changes',
      async () => {
        const initial = await next
          .fetch('/api/with-dep')
          .then((res) => res.json())
        expect(initial.routeVersion).toBe('v1')
        const initialDepEvaluatedAt = initial.depEvaluatedAt

        // Change only the route module, not the dependency
        await next.patchFile('app/api/with-dep/route.ts', (content) =>
          content.replace("'v1'", "'v2'")
        )

        await retry(async () => {
          const updated = await next
            .fetch('/api/with-dep')
            .then((res) => res.json())

          // The route change should be reflected in the response
          expect(updated.routeVersion).toBe('v2')

          // The unmodified dependency should NOT have been re-evaluated
          expect(updated.depEvaluatedAt).toBe(initialDepEvaluatedAt)
        })
      }
    )
  })
})

describe('server-hmr config opt-out', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
    nextConfig: {
      experimental: {
        turbopackServerFastRefresh: false,
      },
    },
  })

  const itTurbopackDev = isTurbopack && isNextDev ? it : it.skip

  itTurbopackDev(
    're-evaluates unmodified dependencies when serverFastRefresh is disabled via config',
    async () => {
      const initial = await next
        .fetch('/api/with-dep')
        .then((res) => res.json())
      expect(initial.routeVersion).toBe('v1')
      const initialDepEvaluatedAt = initial.depEvaluatedAt

      // Change only the route module, not the dependency
      await next.patchFile('app/api/with-dep/route.ts', (content) =>
        content.replace("'v1'", "'v2'")
      )

      await retry(async () => {
        const updated = await next
          .fetch('/api/with-dep')
          .then((res) => res.json())

        expect(updated.routeVersion).toBe('v2')

        // With server HMR disabled, the dependency SHOULD be re-evaluated
        // (full module graph is re-evaluated on changes)
        expect(updated.depEvaluatedAt).not.toBe(initialDepEvaluatedAt)
      })
    }
  )
})

describe('server-hmr CLI/config conflict warning', () => {
  const { next, isNextDev } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
    nextConfig: {
      experimental: {
        turbopackServerFastRefresh: true,
      },
    },
    startArgs: ['--no-server-fast-refresh'],
  })

  if (!isNextDev) {
    it('should be skipped in production', () => {})
    return
  }

  it('should warn when CLI flag conflicts with config', async () => {
    // Trigger a page load so the server is fully started
    await next.render('/')

    expect(next.cliOutput).toContain(
      'The CLI flag "--no-server-fast-refresh" conflicts with "experimental.turbopackServerFastRefresh: true" in your Next.js config. The CLI flag will take precedence.'
    )
  })
})
