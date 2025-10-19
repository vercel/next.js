import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

// Only run this test for Turbopack as it is more conservative (i.e. aggressive) in including
// referenced files and might include too many. (The Webpack snapshots would different slightly from
// the Turbopack ones below.)
//
// This test is not meant for testing correctness (which is done by the behavioral tests), but as a
// regression test to ensure that some stray `path.join` doesn't cause all of the Next.js package to
// get included.
//
// Also skip alternate React versions, as they would require different snapshots.
;(process.env.IS_TURBOPACK_TEST && !isReact18 ? describe : describe.skip)(
  'next-server-nft',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    async function readNormalizedNFT(name) {
      const data = await next.readJSON(name)
      const result = [
        ...new Set(
          data.files
            .filter((file: string) => {
              // They are important, but they are never actually included by themselves but rather as
              // part of some JS files in the same directory tree, which are higher-signal for the
              // screenshot below.
              if (file.endsWith('/package.json')) {
                return false
              }

              // Filter out the many symlinks that power node_modules
              const fileAbsolute = path.join(next.testDir, name, '..', file)
              try {
                if (fs.lstatSync(fileAbsolute).isSymbolicLink()) {
                  return false
                }
              } catch (e) {
                // File doesn't exist - this is a bug in the NFT generation!
                // Keep it in the list so the test can catch it
              }
              return true
            })
            .map((file: string) => {
              // Normalize sharp, different architectures have different files
              if (file.includes('/node_modules/@img/sharp-libvips-')) {
                return '/node_modules/@img/sharp-libvips-*'
              }
              if (
                file.match(
                  /\/node_modules\/@img\/sharp-\w+-\w+\/lib\/sharp-\w+-\w+.node$/
                )
              ) {
                return '/node_modules/@img/sharp-*/sharp-*.node'
              }

              // Strip double node_modules to simplify output
              const firstNodeModules = file.indexOf('/node_modules/')
              const lastNodeModules = file.lastIndexOf('/node_modules/')
              if (firstNodeModules !== lastNodeModules) {
                return file.slice(lastNodeModules)
              }

              return file
            })
        ),
      ]
      result.sort()
      return result
    }

    it('should not trace too many files in next-server.js.nft.json', async () => {
      const trace = await readNormalizedNFT('.next/next-server.js.nft.json')

      // Group the entries together so that the snapshot doesn't change too often.
      // This trace contains quite a lot of files that aren't actually needed. But there isn't much
      // that Turbopack itself can do about that.
      const traceGrouped = [
        ...new Set(
          trace.map((file: string) => {
            if (file.startsWith('/node_modules/next/')) {
              if (file.startsWith('/node_modules/next/dist/client/')) {
                return '/node_modules/next/dist/client/*'
              }
              if (file.startsWith('/node_modules/next/dist/server/')) {
                return '/node_modules/next/dist/server/*'
              }
              if (file.startsWith('/node_modules/next/dist/shared/')) {
                return '/node_modules/next/dist/shared/*'
              }
            } else if (
              file.startsWith('/node_modules/react') ||
              file.endsWith('.node')
            ) {
              return file
            } else {
              let match = /^\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//.exec(file)
              if (match != null) {
                return `/node_modules/${match[1]}/*`
              }
            }
            return file
          })
        ),
      ]

      expect(traceGrouped).toMatchInlineSnapshot(`
       [
         "/node_modules/@img/colour/*",
         "/node_modules/@img/sharp-*/sharp-*.node",
         "/node_modules/@img/*",
         "/node_modules/@next/env/*",
         "/node_modules/@swc/helpers/*",
         "/node_modules/client-only/*",
         "/node_modules/detect-libc/*",
         "/node_modules/next/dist/build/output/log.js",
         "/node_modules/next/dist/build/segment-config/app/app-segment-config.js",
         "/node_modules/next/dist/build/segment-config/app/app-segments.js",
         "/node_modules/next/dist/build/static-paths/utils.js",
         "/node_modules/next/dist/client/*",
         "/node_modules/next/dist/compiled/@edge-runtime/cookies/index.js",
         "/node_modules/next/dist/compiled/@hapi/accept/index.js",
         "/node_modules/next/dist/compiled/@mswjs/interceptors/ClientRequest/index.js",
         "/node_modules/next/dist/compiled/@opentelemetry/api/index.js",
         "/node_modules/next/dist/compiled/babel-code-frame/index.js",
         "/node_modules/next/dist/compiled/babel/code-frame.js",
         "/node_modules/next/dist/compiled/busboy/index.js",
         "/node_modules/next/dist/compiled/bytes/index.js",
         "/node_modules/next/dist/compiled/content-disposition/index.js",
         "/node_modules/next/dist/compiled/cookie/index.js",
         "/node_modules/next/dist/compiled/debug/index.js",
         "/node_modules/next/dist/compiled/edge-runtime/index.js",
         "/node_modules/next/dist/compiled/fresh/index.js",
         "/node_modules/next/dist/compiled/image-detector/detector.js",
         "/node_modules/next/dist/compiled/image-size/index.js",
         "/node_modules/next/dist/compiled/is-animated/index.js",
         "/node_modules/next/dist/compiled/is-local-address/index.js",
         "/node_modules/next/dist/compiled/jsonwebtoken/index.js",
         "/node_modules/next/dist/compiled/nanoid/index.cjs",
         "/node_modules/next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js",
         "/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",
         "/node_modules/next/dist/compiled/next-server/pages-turbo.runtime.prod.js",
         "/node_modules/next/dist/compiled/p-queue/index.js",
         "/node_modules/next/dist/compiled/path-browserify/index.js",
         "/node_modules/next/dist/compiled/path-to-regexp/index.js",
         "/node_modules/next/dist/compiled/picomatch/index.js",
         "/node_modules/next/dist/compiled/react-is/cjs/react-is.development.js",
         "/node_modules/next/dist/compiled/react-is/cjs/react-is.production.js",
         "/node_modules/next/dist/compiled/react-is/index.js",
         "/node_modules/next/dist/compiled/safe-stable-stringify/index.js",
         "/node_modules/next/dist/compiled/send/index.js",
         "/node_modules/next/dist/compiled/source-map/source-map.js",
         "/node_modules/next/dist/compiled/stacktrace-parser/stack-trace-parser.cjs.js",
         "/node_modules/next/dist/compiled/string-hash/index.js",
         "/node_modules/next/dist/compiled/strip-ansi/index.js",
         "/node_modules/next/dist/compiled/superstruct/index.cjs",
         "/node_modules/next/dist/compiled/ws/index.js",
         "/node_modules/next/dist/compiled/zod-validation-error/index.js",
         "/node_modules/next/dist/compiled/zod/index.cjs",
         "/node_modules/next/dist/experimental/testmode/context.js",
         "/node_modules/next/dist/experimental/testmode/fetch.js",
         "/node_modules/next/dist/experimental/testmode/httpget.js",
         "/node_modules/next/dist/experimental/testmode/server-edge.js",
         "/node_modules/next/dist/experimental/testmode/server.js",
         "/node_modules/next/dist/lib/batcher.js",
         "/node_modules/next/dist/lib/client-and-server-references.js",
         "/node_modules/next/dist/lib/constants.js",
         "/node_modules/next/dist/lib/detached-promise.js",
         "/node_modules/next/dist/lib/error-telemetry-utils.js",
         "/node_modules/next/dist/lib/fallback.js",
         "/node_modules/next/dist/lib/find-pages-dir.js",
         "/node_modules/next/dist/lib/format-dynamic-import-path.js",
         "/node_modules/next/dist/lib/format-server-error.js",
         "/node_modules/next/dist/lib/framework/boundary-components.js",
         "/node_modules/next/dist/lib/framework/boundary-constants.js",
         "/node_modules/next/dist/lib/generate-interception-routes-rewrites.js",
         "/node_modules/next/dist/lib/interop-default.js",
         "/node_modules/next/dist/lib/is-api-route.js",
         "/node_modules/next/dist/lib/is-app-page-route.js",
         "/node_modules/next/dist/lib/is-app-route-route.js",
         "/node_modules/next/dist/lib/is-error.js",
         "/node_modules/next/dist/lib/is-serializable-props.js",
         "/node_modules/next/dist/lib/metadata/get-metadata-route.js",
         "/node_modules/next/dist/lib/metadata/is-metadata-route.js",
         "/node_modules/next/dist/lib/metadata/metadata-context.js",
         "/node_modules/next/dist/lib/multi-file-writer.js",
         "/node_modules/next/dist/lib/non-nullable.js",
         "/node_modules/next/dist/lib/page-types.js",
         "/node_modules/next/dist/lib/pick.js",
         "/node_modules/next/dist/lib/picocolors.js",
         "/node_modules/next/dist/lib/redirect-status.js",
         "/node_modules/next/dist/lib/route-pattern-normalizer.js",
         "/node_modules/next/dist/lib/scheduler.js",
         "/node_modules/next/dist/lib/semver-noop.js",
         "/node_modules/next/dist/lib/static-env.js",
         "/node_modules/next/dist/lib/url.js",
         "/node_modules/next/dist/lib/wait.js",
         "/node_modules/next/dist/next-devtools/server/shared.js",
         "/node_modules/next/dist/server/*",
         "/node_modules/next/dist/shared/*",
         "/node_modules/react-dom/cjs/react-dom-server-legacy.browser.production.js",
         "/node_modules/react-dom/cjs/react-dom-server-legacy.node.production.js",
         "/node_modules/react-dom/cjs/react-dom-server.browser.production.js",
         "/node_modules/react-dom/cjs/react-dom-server.edge.production.js",
         "/node_modules/react-dom/cjs/react-dom-server.node.production.js",
         "/node_modules/react-dom/cjs/react-dom.production.js",
         "/node_modules/react-dom/index.js",
         "/node_modules/react-dom/server.browser.js",
         "/node_modules/react-dom/server.edge.js",
         "/node_modules/react-dom/server.node.js",
         "/node_modules/react-dom/static.node.js",
         "/node_modules/react/cjs/react-compiler-runtime.production.js",
         "/node_modules/react/cjs/react-jsx-dev-runtime.production.js",
         "/node_modules/react/cjs/react-jsx-runtime.production.js",
         "/node_modules/react/cjs/react.production.js",
         "/node_modules/react/compiler-runtime.js",
         "/node_modules/react/index.js",
         "/node_modules/react/jsx-dev-runtime.js",
         "/node_modules/react/jsx-runtime.js",
         "/node_modules/semver/*",
         "/node_modules/sharp/*",
         "/node_modules/styled-jsx/*",
       ]
      `)
    })

    it('should not include .next directory in traces despite dynamic fs operations', async () => {
      // This test verifies that the denied_path feature prevents the .next directory
      // from being included in traces. The app/dynamic-read page uses dynamic fs.readFileSync
      // with path.join(process.cwd(), ...) which could theoretically read any file.

      // Check the page-specific trace that has the dynamic fs operations
      const pageTrace = await readNormalizedNFT(
        '.next/server/app/dynamic-read/page.js.nft.json'
      )

      // Snapshot the non-node_modules and non-chunks files to see what's being traced
      // We also filter out chunks because their names change with every build
      const nonNodeModulesFiles = pageTrace.filter(
        (file: string) =>
          !file.includes('/node_modules/') && !file.includes('/chunks/')
      )

      expect(nonNodeModulesFiles).toMatchInlineSnapshot(`
       [
         "./page/react-loadable-manifest.json",
         "./page_client-reference-manifest.js",
       ]
      `)
    })

    it('should not trace too many files in next-minimal-server.js.nft.json', async () => {
      const trace = await readNormalizedNFT(
        '.next/next-minimal-server.js.nft.json'
      )
      expect(trace).toMatchInlineSnapshot(`
       [
         "/node_modules/client-only/index.js",
         "/node_modules/next/dist/client/components/app-router-headers.js",
         "/node_modules/next/dist/compiled/@opentelemetry/api/index.js",
         "/node_modules/next/dist/compiled/babel-code-frame/index.js",
         "/node_modules/next/dist/compiled/babel/code-frame.js",
         "/node_modules/next/dist/compiled/next-server/server.runtime.prod.js",
         "/node_modules/next/dist/compiled/safe-stable-stringify/index.js",
         "/node_modules/next/dist/compiled/source-map/source-map.js",
         "/node_modules/next/dist/compiled/stacktrace-parser/stack-trace-parser.cjs.js",
         "/node_modules/next/dist/compiled/ws/index.js",
         "/node_modules/next/dist/experimental/testmode/context.js",
         "/node_modules/next/dist/experimental/testmode/fetch.js",
         "/node_modules/next/dist/experimental/testmode/server-edge.js",
         "/node_modules/next/dist/lib/client-and-server-references.js",
         "/node_modules/next/dist/lib/constants.js",
         "/node_modules/next/dist/lib/interop-default.js",
         "/node_modules/next/dist/lib/is-error.js",
         "/node_modules/next/dist/lib/picocolors.js",
         "/node_modules/next/dist/server/app-render/after-task-async-storage-instance.js",
         "/node_modules/next/dist/server/app-render/after-task-async-storage.external.js",
         "/node_modules/next/dist/server/app-render/async-local-storage.js",
         "/node_modules/next/dist/server/app-render/console-async-storage-instance.js",
         "/node_modules/next/dist/server/app-render/console-async-storage.external.js",
         "/node_modules/next/dist/server/app-render/work-async-storage-instance.js",
         "/node_modules/next/dist/server/app-render/work-async-storage.external.js",
         "/node_modules/next/dist/server/app-render/work-unit-async-storage-instance.js",
         "/node_modules/next/dist/server/app-render/work-unit-async-storage.external.js",
         "/node_modules/next/dist/server/lib/cache-handlers/default.external.js",
         "/node_modules/next/dist/server/lib/incremental-cache/memory-cache.external.js",
         "/node_modules/next/dist/server/lib/incremental-cache/shared-cache-controls.external.js",
         "/node_modules/next/dist/server/lib/incremental-cache/tags-manifest.external.js",
         "/node_modules/next/dist/server/lib/lru-cache.js",
         "/node_modules/next/dist/server/lib/router-utils/instrumentation-globals.external.js",
         "/node_modules/next/dist/server/lib/router-utils/instrumentation-node-extensions.js",
         "/node_modules/next/dist/server/lib/trace/constants.js",
         "/node_modules/next/dist/server/lib/trace/tracer.js",
         "/node_modules/next/dist/server/load-manifest.external.js",
         "/node_modules/next/dist/server/node-environment-extensions/console-dim.external.js",
         "/node_modules/next/dist/server/response-cache/types.js",
         "/node_modules/next/dist/server/route-modules/app-page/module.compiled.js",
         "/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/app-router-context.js",
         "/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/entrypoints.js",
         "/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/head-manager-context.js",
         "/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/hooks-client-context.js",
         "/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/image-config-context.js",
         "/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/router-context.js",
         "/node_modules/next/dist/server/route-modules/app-page/vendored/contexts/server-inserted-html.js",
         "/node_modules/next/dist/server/route-modules/pages/module.compiled.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/app-router-context.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/entrypoints.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/head-manager-context.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/hooks-client-context.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/html-context.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/image-config-context.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/loadable-context.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/loadable.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/router-context.js",
         "/node_modules/next/dist/server/route-modules/pages/vendored/contexts/server-inserted-html.js",
         "/node_modules/next/dist/shared/lib/deep-freeze.js",
         "/node_modules/next/dist/shared/lib/invariant-error.js",
         "/node_modules/next/dist/shared/lib/is-plain-object.js",
         "/node_modules/next/dist/shared/lib/is-thenable.js",
         "/node_modules/next/dist/shared/lib/no-fallback-error.external.js",
         "/node_modules/next/dist/shared/lib/server-reference-info.js",
         "/node_modules/react/cjs/react.production.js",
         "/node_modules/react/index.js",
         "/node_modules/styled-jsx/dist/index/index.js",
         "/node_modules/styled-jsx/index.js",
         "/node_modules/styled-jsx/style.js",
       ]
      `)
    })
  }
)
