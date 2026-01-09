import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

async function readNormalizedNFT(next, name) {
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
    describe('with output:standalone', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        skipDeployment: true,
        dependencies: {
          typescript: '5.9.2',
        },
        nextConfig: {
          output: 'standalone',
        },
      })

      if (skipped) {
        return
      }

      it('should not trace too many files in next-server.js.nft.json', async () => {
        const trace = await readNormalizedNFT(
          next,
          '.next/next-server.js.nft.json'
        )

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
                let match = /^\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//.exec(
                  file
                )
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
           "/node_modules/next/dist/build/adapter/build-complete.js",
           "/node_modules/next/dist/build/after-production-compile.js",
           "/node_modules/next/dist/build/analysis/extract-const-value.js",
           "/node_modules/next/dist/build/analysis/get-page-static-info.js",
           "/node_modules/next/dist/build/analysis/parse-module.js",
           "/node_modules/next/dist/build/analyze/index.js",
           "/node_modules/next/dist/build/babel/loader/get-config.js",
           "/node_modules/next/dist/build/babel/loader/index.js",
           "/node_modules/next/dist/build/babel/loader/transform.js",
           "/node_modules/next/dist/build/babel/loader/util.js",
           "/node_modules/next/dist/build/babel/plugins/commonjs.js",
           "/node_modules/next/dist/build/babel/plugins/jsx-pragma.js",
           "/node_modules/next/dist/build/babel/plugins/next-font-unsupported.js",
           "/node_modules/next/dist/build/babel/plugins/next-page-config.js",
           "/node_modules/next/dist/build/babel/plugins/next-page-disallow-re-export-all-exports.js",
           "/node_modules/next/dist/build/babel/plugins/next-ssg-transform.js",
           "/node_modules/next/dist/build/babel/plugins/optimize-hook-destructuring.js",
           "/node_modules/next/dist/build/babel/plugins/react-loadable-plugin.js",
           "/node_modules/next/dist/build/babel/preset.js",
           "/node_modules/next/dist/build/build-context.js",
           "/node_modules/next/dist/build/collect-build-traces.js",
           "/node_modules/next/dist/build/compiler.js",
           "/node_modules/next/dist/build/create-compiler-aliases.js",
           "/node_modules/next/dist/build/define-env.js",
           "/node_modules/next/dist/build/duration-to-string.js",
           "/node_modules/next/dist/build/entries.js",
           "/node_modules/next/dist/build/generate-build-id.js",
           "/node_modules/next/dist/build/generate-routes-manifest.js",
           "/node_modules/next/dist/build/get-babel-config-file.js",
           "/node_modules/next/dist/build/get-babel-loader-config.js",
           "/node_modules/next/dist/build/get-static-info-including-layouts.js",
           "/node_modules/next/dist/build/handle-entrypoints.js",
           "/node_modules/next/dist/build/handle-externals.js",
           "/node_modules/next/dist/build/index.js",
           "/node_modules/next/dist/build/is-writeable.js",
           "/node_modules/next/dist/build/jest/__mocks__/empty.js",
           "/node_modules/next/dist/build/jest/__mocks__/fileMock.js",
           "/node_modules/next/dist/build/jest/__mocks__/nextFontMock.js",
           "/node_modules/next/dist/build/jest/__mocks__/styleMock.js",
           "/node_modules/next/dist/build/jest/jest.js",
           "/node_modules/next/dist/build/jest/object-proxy.js",
           "/node_modules/next/dist/build/load-entrypoint.js",
           "/node_modules/next/dist/build/load-jsconfig.js",
           "/node_modules/next/dist/build/lockfile.js",
           "/node_modules/next/dist/build/manifests/formatter/format-manifest.js",
           "/node_modules/next/dist/build/next-config-ts/require-hook.js",
           "/node_modules/next/dist/build/next-config-ts/transpile-config.js",
           "/node_modules/next/dist/build/next-dir-paths.js",
           "/node_modules/next/dist/build/normalize-catchall-routes.js",
           "/node_modules/next/dist/build/output/format.js",
           "/node_modules/next/dist/build/output/index.js",
           "/node_modules/next/dist/build/output/log.js",
           "/node_modules/next/dist/build/output/store.js",
           "/node_modules/next/dist/build/page-extensions-type.js",
           "/node_modules/next/dist/build/polyfills/fetch/index.js",
           "/node_modules/next/dist/build/polyfills/fetch/whatwg-fetch.js",
           "/node_modules/next/dist/build/polyfills/object-assign.js",
           "/node_modules/next/dist/build/polyfills/object.assign/auto.js",
           "/node_modules/next/dist/build/polyfills/object.assign/implementation.js",
           "/node_modules/next/dist/build/polyfills/object.assign/index.js",
           "/node_modules/next/dist/build/polyfills/object.assign/polyfill.js",
           "/node_modules/next/dist/build/polyfills/object.assign/shim.js",
           "/node_modules/next/dist/build/polyfills/polyfill-module.js",
           "/node_modules/next/dist/build/polyfills/polyfill-nomodule.js",
           "/node_modules/next/dist/build/polyfills/process.js",
           "/node_modules/next/dist/build/preview-key-utils.js",
           "/node_modules/next/dist/build/progress.js",
           "/node_modules/next/dist/build/rendering-mode.js",
           "/node_modules/next/dist/build/segment-config/app/app-segment-config.js",
           "/node_modules/next/dist/build/segment-config/app/app-segments.js",
           "/node_modules/next/dist/build/segment-config/app/collect-root-param-keys.js",
           "/node_modules/next/dist/build/segment-config/middleware/middleware-config.js",
           "/node_modules/next/dist/build/segment-config/pages/pages-segment-config.js",
           "/node_modules/next/dist/build/sort-by-page-exts.js",
           "/node_modules/next/dist/build/spinner.js",
           "/node_modules/next/dist/build/static-paths/app.js",
           "/node_modules/next/dist/build/static-paths/app/extract-pathname-route-param-segments-from-loader-tree.js",
           "/node_modules/next/dist/build/static-paths/pages.js",
           "/node_modules/next/dist/build/static-paths/types.js",
           "/node_modules/next/dist/build/static-paths/utils.js",
           "/node_modules/next/dist/build/swc/helpers.js",
           "/node_modules/next/dist/build/swc/index.js",
           "/node_modules/next/dist/build/swc/install-bindings.js",
           "/node_modules/next/dist/build/swc/jest-transformer.js",
           "/node_modules/next/dist/build/swc/options.js",
           "/node_modules/next/dist/build/swc/types.js",
           "/node_modules/next/dist/build/templates/app-page.js",
           "/node_modules/next/dist/build/templates/app-route.js",
           "/node_modules/next/dist/build/templates/edge-app-route.js",
           "/node_modules/next/dist/build/templates/edge-ssr-app.js",
           "/node_modules/next/dist/build/templates/edge-ssr.js",
           "/node_modules/next/dist/build/templates/edge-wrapper.js",
           "/node_modules/next/dist/build/templates/helpers.js",
           "/node_modules/next/dist/build/templates/middleware.js",
           "/node_modules/next/dist/build/templates/pages-api.js",
           "/node_modules/next/dist/build/templates/pages-edge-api.js",
           "/node_modules/next/dist/build/templates/pages.js",
           "/node_modules/next/dist/build/turbopack-analyze/index.js",
           "/node_modules/next/dist/build/turbopack-build/impl.js",
           "/node_modules/next/dist/build/turbopack-build/index.js",
           "/node_modules/next/dist/build/turborepo-access-trace/env.js",
           "/node_modules/next/dist/build/turborepo-access-trace/helpers.js",
           "/node_modules/next/dist/build/turborepo-access-trace/index.js",
           "/node_modules/next/dist/build/turborepo-access-trace/result.js",
           "/node_modules/next/dist/build/turborepo-access-trace/tcp.js",
           "/node_modules/next/dist/build/turborepo-access-trace/types.js",
           "/node_modules/next/dist/build/type-check.js",
           "/node_modules/next/dist/build/utils.js",
           "/node_modules/next/dist/build/validate-app-paths.js",
           "/node_modules/next/dist/build/webpack-build/impl.js",
           "/node_modules/next/dist/build/webpack-build/index.js",
           "/node_modules/next/dist/build/webpack-config-rules/resolve.js",
           "/node_modules/next/dist/build/webpack-config.js",
           "/node_modules/next/dist/build/webpack/alias/react-dom-server-experimental.js",
           "/node_modules/next/dist/build/webpack/alias/react-dom-server.js",
           "/node_modules/next/dist/build/webpack/cache-invalidation.js",
           "/node_modules/next/dist/build/webpack/config/blocks/base.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/index.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/loaders/client.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/loaders/file-resolve.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/loaders/getCssModuleLocalIdent.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/loaders/global.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/loaders/index.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/loaders/modules.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/loaders/next-font.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/messages.js",
           "/node_modules/next/dist/build/webpack/config/blocks/css/plugins.js",
           "/node_modules/next/dist/build/webpack/config/blocks/images/index.js",
           "/node_modules/next/dist/build/webpack/config/blocks/images/messages.js",
           "/node_modules/next/dist/build/webpack/config/helpers.js",
           "/node_modules/next/dist/build/webpack/config/index.js",
           "/node_modules/next/dist/build/webpack/config/utils.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/CssSyntaxError.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/camelcase.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/index.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/plugins/index.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/plugins/postcss-icss-parser.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/plugins/postcss-import-parser.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/plugins/postcss-url-parser.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/runtime/api.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/runtime/getUrl.js",
           "/node_modules/next/dist/build/webpack/loaders/css-loader/src/utils.js",
           "/node_modules/next/dist/build/webpack/loaders/devtool/devtool-style-inject.js",
           "/node_modules/next/dist/build/webpack/loaders/empty-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/error-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/get-module-build-info.js",
           "/node_modules/next/dist/build/webpack/loaders/lightningcss-loader/src/codegen.js",
           "/node_modules/next/dist/build/webpack/loaders/lightningcss-loader/src/index.js",
           "/node_modules/next/dist/build/webpack/loaders/lightningcss-loader/src/interface.js",
           "/node_modules/next/dist/build/webpack/loaders/lightningcss-loader/src/loader.js",
           "/node_modules/next/dist/build/webpack/loaders/lightningcss-loader/src/minify.js",
           "/node_modules/next/dist/build/webpack/loaders/lightningcss-loader/src/utils.js",
           "/node_modules/next/dist/build/webpack/loaders/metadata/discover.js",
           "/node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js",
           "/node_modules/next/dist/build/webpack/loaders/metadata/types.js",
           "/node_modules/next/dist/build/webpack/loaders/modularize-import-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-app-loader/create-app-route-code.js",
           "/node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-barrel-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-client-pages-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-edge-app-route-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-edge-function-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-edge-ssr-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-error-browser-binary-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-action-entry-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-client-module-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-css-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-loader/module-proxy.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-loader/track-dynamic-import.js",
           "/node_modules/next/dist/build/webpack/loaders/next-flight-server-reference-proxy-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-font-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-font-loader/postcss-next-font.js",
           "/node_modules/next/dist/build/webpack/loaders/next-image-loader/blur.js",
           "/node_modules/next/dist/build/webpack/loaders/next-image-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-invalid-import-error-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-metadata-image-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-metadata-route-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-middleware-asset-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-middleware-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-middleware-wasm-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-root-params-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/next-route-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-style-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/next-style-loader/runtime/injectStylesIntoLinkTag.js",
           "/node_modules/next/dist/build/webpack/loaders/next-style-loader/runtime/injectStylesIntoStyleTag.js",
           "/node_modules/next/dist/build/webpack/loaders/next-style-loader/runtime/isEqualLocals.js",
           "/node_modules/next/dist/build/webpack/loaders/next-swc-loader.js",
           "/node_modules/next/dist/build/webpack/loaders/postcss-loader/src/Error.js",
           "/node_modules/next/dist/build/webpack/loaders/postcss-loader/src/Warning.js",
           "/node_modules/next/dist/build/webpack/loaders/postcss-loader/src/index.js",
           "/node_modules/next/dist/build/webpack/loaders/postcss-loader/src/utils.js",
           "/node_modules/next/dist/build/webpack/loaders/resolve-url-loader/index.js",
           "/node_modules/next/dist/build/webpack/loaders/resolve-url-loader/lib/file-protocol.js",
           "/node_modules/next/dist/build/webpack/loaders/resolve-url-loader/lib/join-function.js",
           "/node_modules/next/dist/build/webpack/loaders/resolve-url-loader/lib/postcss.js",
           "/node_modules/next/dist/build/webpack/loaders/resolve-url-loader/lib/value-processor.js",
           "/node_modules/next/dist/build/webpack/loaders/utils.js",
           "/node_modules/next/dist/build/webpack/plugins/build-manifest-plugin-utils.js",
           "/node_modules/next/dist/build/webpack/plugins/build-manifest-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/copy-file-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/css-chunking-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/css-minimizer-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/devtools-ignore-list-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/eval-source-map-dev-tool-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/flight-client-entry-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/flight-manifest-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/force-complete-runtime.js",
           "/node_modules/next/dist/build/webpack/plugins/jsconfig-paths-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/memory-with-gc-cache-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/middleware-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/mini-css-extract-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/minify-webpack-plugin/src/index.js",
           "/node_modules/next/dist/build/webpack/plugins/next-font-manifest-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/next-trace-entrypoints-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/next-types-plugin/index.js",
           "/node_modules/next/dist/build/webpack/plugins/next-types-plugin/shared.js",
           "/node_modules/next/dist/build/webpack/plugins/nextjs-require-cache-hot-reloader.js",
           "/node_modules/next/dist/build/webpack/plugins/optional-peer-dependency-resolve-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/pages-manifest-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/profiling-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/react-loadable-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/rspack-flight-client-entry-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/rspack-profiling-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/slow-module-detection-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/subresource-integrity-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/telemetry-plugin/telemetry-plugin.js",
           "/node_modules/next/dist/build/webpack/plugins/telemetry-plugin/update-telemetry-loader-context-from-swc.js",
           "/node_modules/next/dist/build/webpack/plugins/telemetry-plugin/use-cache-tracker-utils.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/getModuleTrace.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/index.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parse-dynamic-code-evaluation-error.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parseBabel.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parseCss.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parseNextAppLoaderError.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parseNextFontError.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parseNextInvalidImportError.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parseNotFoundError.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/parseScss.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/simpleWebpackError.js",
           "/node_modules/next/dist/build/webpack/plugins/wellknown-errors-plugin/webpackModuleError.js",
           "/node_modules/next/dist/build/webpack/stringify-request.js",
           "/node_modules/next/dist/build/webpack/utils.js",
           "/node_modules/next/dist/build/worker.js",
           "/node_modules/next/dist/build/write-build-id.js",
           "/node_modules/next/dist/cli/next-test.js",
           "/node_modules/next/dist/client/*",
           "/node_modules/next/dist/compiled/@edge-runtime/cookies/index.js",
           "/node_modules/next/dist/compiled/@edge-runtime/ponyfill/index.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/abort-controller.js.text.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/console.js.text.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/events.js.text.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/index.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/load.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/stream.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/timers.js.text.js",
           "/node_modules/next/dist/compiled/@edge-runtime/primitives/url.js.text.js",
           "/node_modules/next/dist/compiled/@hapi/accept/index.js",
           "/node_modules/next/dist/compiled/@mswjs/interceptors/ClientRequest/index.js",
           "/node_modules/next/dist/compiled/@napi-rs/triples/index.js",
           "/node_modules/next/dist/compiled/@opentelemetry/api/index.js",
           "/node_modules/next/dist/compiled/async-retry/index.js",
           "/node_modules/next/dist/compiled/async-sema/index.js",
           "/node_modules/next/dist/compiled/babel-code-frame/index.js",
           "/node_modules/next/dist/compiled/babel/code-frame.js",
           "/node_modules/next/dist/compiled/busboy/index.js",
           "/node_modules/next/dist/compiled/bytes/index.js",
           "/node_modules/next/dist/compiled/ci-info/index.js",
           "/node_modules/next/dist/compiled/commander/index.js",
           "/node_modules/next/dist/compiled/comment-json/index.js",
           "/node_modules/next/dist/compiled/compression/index.js",
           "/node_modules/next/dist/compiled/conf/index.js",
           "/node_modules/next/dist/compiled/content-disposition/index.js",
           "/node_modules/next/dist/compiled/cookie/index.js",
           "/node_modules/next/dist/compiled/cross-spawn/index.js",
           "/node_modules/next/dist/compiled/debug/index.js",
           "/node_modules/next/dist/compiled/edge-runtime/index.js",
           "/node_modules/next/dist/compiled/find-up/index.js",
           "/node_modules/next/dist/compiled/fresh/index.js",
           "/node_modules/next/dist/compiled/http-proxy/index.js",
           "/node_modules/next/dist/compiled/image-detector/detector.js",
           "/node_modules/next/dist/compiled/image-size/index.js",
           "/node_modules/next/dist/compiled/ipaddr.js/ipaddr.js",
           "/node_modules/next/dist/compiled/is-animated/index.js",
           "/node_modules/next/dist/compiled/is-docker/index.js",
           "/node_modules/next/dist/compiled/is-wsl/index.js",
           "/node_modules/next/dist/compiled/jsonwebtoken/index.js",
           "/node_modules/next/dist/compiled/nanoid/index.cjs",
           "/node_modules/next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js",
           "/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",
           "/node_modules/next/dist/compiled/next-server/pages-turbo.runtime.prod.js",
           "/node_modules/next/dist/compiled/p-limit/index.js",
           "/node_modules/next/dist/compiled/p-queue/index.js",
           "/node_modules/next/dist/compiled/path-browserify/index.js",
           "/node_modules/next/dist/compiled/path-to-regexp/index.js",
           "/node_modules/next/dist/compiled/picomatch/index.js",
           "/node_modules/next/dist/compiled/react-is/cjs/react-is.development.js",
           "/node_modules/next/dist/compiled/react-is/cjs/react-is.production.js",
           "/node_modules/next/dist/compiled/react-is/index.js",
           "/node_modules/next/dist/compiled/regenerator-runtime/runtime.js",
           "/node_modules/next/dist/compiled/semver/index.js",
           "/node_modules/next/dist/compiled/send/index.js",
           "/node_modules/next/dist/compiled/source-map/source-map.js",
           "/node_modules/next/dist/compiled/stacktrace-parser/stack-trace-parser.cjs.js",
           "/node_modules/next/dist/compiled/string-hash/index.js",
           "/node_modules/next/dist/compiled/strip-ansi/index.js",
           "/node_modules/next/dist/compiled/superstruct/index.cjs",
           "/node_modules/next/dist/compiled/tar/index.js",
           "/node_modules/next/dist/compiled/text-table/index.js",
           "/node_modules/next/dist/compiled/watchpack/watchpack.js",
           "/node_modules/next/dist/compiled/ws/index.js",
           "/node_modules/next/dist/compiled/zod-validation-error/index.js",
           "/node_modules/next/dist/compiled/zod/index.cjs",
           "/node_modules/next/dist/experimental/testmode/context.js",
           "/node_modules/next/dist/experimental/testmode/fetch.js",
           "/node_modules/next/dist/experimental/testmode/httpget.js",
           "/node_modules/next/dist/experimental/testmode/server-edge.js",
           "/node_modules/next/dist/experimental/testmode/server.js",
           "/node_modules/next/dist/export/helpers/create-incremental-cache.js",
           "/node_modules/next/dist/lib/batcher.js",
           "/node_modules/next/dist/lib/build-custom-route.js",
           "/node_modules/next/dist/lib/bundler.js",
           "/node_modules/next/dist/lib/client-and-server-references.js",
           "/node_modules/next/dist/lib/coalesced-function.js",
           "/node_modules/next/dist/lib/compile-error.js",
           "/node_modules/next/dist/lib/constants.js",
           "/node_modules/next/dist/lib/create-client-router-filter.js",
           "/node_modules/next/dist/lib/default-transpiled-packages.json",
           "/node_modules/next/dist/lib/detached-promise.js",
           "/node_modules/next/dist/lib/detect-typo.js",
           "/node_modules/next/dist/lib/download-swc.js",
           "/node_modules/next/dist/lib/error-telemetry-utils.js",
           "/node_modules/next/dist/lib/fallback.js",
           "/node_modules/next/dist/lib/fatal-error.js",
           "/node_modules/next/dist/lib/file-exists.js",
           "/node_modules/next/dist/lib/find-config.js",
           "/node_modules/next/dist/lib/find-pages-dir.js",
           "/node_modules/next/dist/lib/find-root.js",
           "/node_modules/next/dist/lib/format-cli-help-output.js",
           "/node_modules/next/dist/lib/format-dynamic-import-path.js",
           "/node_modules/next/dist/lib/format-server-error.js",
           "/node_modules/next/dist/lib/framework/boundary-components.js",
           "/node_modules/next/dist/lib/framework/boundary-constants.js",
           "/node_modules/next/dist/lib/fs/rename.js",
           "/node_modules/next/dist/lib/fs/write-atomic.js",
           "/node_modules/next/dist/lib/generate-interception-routes-rewrites.js",
           "/node_modules/next/dist/lib/get-files-in-dir.js",
           "/node_modules/next/dist/lib/get-network-host.js",
           "/node_modules/next/dist/lib/get-package-version.js",
           "/node_modules/next/dist/lib/get-project-dir.js",
           "/node_modules/next/dist/lib/has-necessary-dependencies.js",
           "/node_modules/next/dist/lib/helpers/get-cache-directory.js",
           "/node_modules/next/dist/lib/helpers/get-npx-command.js",
           "/node_modules/next/dist/lib/helpers/get-online.js",
           "/node_modules/next/dist/lib/helpers/get-pkg-manager.js",
           "/node_modules/next/dist/lib/helpers/get-registry.js",
           "/node_modules/next/dist/lib/helpers/get-reserved-port.js",
           "/node_modules/next/dist/lib/helpers/install.js",
           "/node_modules/next/dist/lib/import-next-warning.js",
           "/node_modules/next/dist/lib/inline-static-env.js",
           "/node_modules/next/dist/lib/install-dependencies.js",
           "/node_modules/next/dist/lib/interop-default.js",
           "/node_modules/next/dist/lib/is-api-route.js",
           "/node_modules/next/dist/lib/is-app-page-route.js",
           "/node_modules/next/dist/lib/is-app-route-route.js",
           "/node_modules/next/dist/lib/is-edge-runtime.js",
           "/node_modules/next/dist/lib/is-error.js",
           "/node_modules/next/dist/lib/is-internal-component.js",
           "/node_modules/next/dist/lib/is-serializable-props.js",
           "/node_modules/next/dist/lib/known-edge-safe-packages.json",
           "/node_modules/next/dist/lib/load-custom-routes.js",
           "/node_modules/next/dist/lib/memory/gc-observer.js",
           "/node_modules/next/dist/lib/memory/shutdown.js",
           "/node_modules/next/dist/lib/memory/startup.js",
           "/node_modules/next/dist/lib/memory/trace.js",
           "/node_modules/next/dist/lib/metadata/constants.js",
           "/node_modules/next/dist/lib/metadata/default-metadata.js",
           "/node_modules/next/dist/lib/metadata/generate/alternate.js",
           "/node_modules/next/dist/lib/metadata/generate/basic.js",
           "/node_modules/next/dist/lib/metadata/generate/icon-mark.js",
           "/node_modules/next/dist/lib/metadata/generate/icons.js",
           "/node_modules/next/dist/lib/metadata/generate/meta.js",
           "/node_modules/next/dist/lib/metadata/generate/opengraph.js",
           "/node_modules/next/dist/lib/metadata/generate/utils.js",
           "/node_modules/next/dist/lib/metadata/get-metadata-route.js",
           "/node_modules/next/dist/lib/metadata/is-metadata-route.js",
           "/node_modules/next/dist/lib/metadata/metadata-context.js",
           "/node_modules/next/dist/lib/metadata/metadata.js",
           "/node_modules/next/dist/lib/metadata/resolve-metadata.js",
           "/node_modules/next/dist/lib/metadata/resolvers/resolve-basics.js",
           "/node_modules/next/dist/lib/metadata/resolvers/resolve-icons.js",
           "/node_modules/next/dist/lib/metadata/resolvers/resolve-opengraph.js",
           "/node_modules/next/dist/lib/metadata/resolvers/resolve-title.js",
           "/node_modules/next/dist/lib/metadata/resolvers/resolve-url.js",
           "/node_modules/next/dist/lib/metadata/types/alternative-urls-types.js",
           "/node_modules/next/dist/lib/metadata/types/extra-types.js",
           "/node_modules/next/dist/lib/metadata/types/icons.js",
           "/node_modules/next/dist/lib/metadata/types/manifest-types.js",
           "/node_modules/next/dist/lib/metadata/types/metadata-interface.js",
           "/node_modules/next/dist/lib/metadata/types/metadata-types.js",
           "/node_modules/next/dist/lib/metadata/types/opengraph-types.js",
           "/node_modules/next/dist/lib/metadata/types/resolvers.js",
           "/node_modules/next/dist/lib/metadata/types/twitter-types.js",
           "/node_modules/next/dist/lib/mime-type.js",
           "/node_modules/next/dist/lib/mkcert.js",
           "/node_modules/next/dist/lib/multi-file-writer.js",
           "/node_modules/next/dist/lib/needs-experimental-react.js",
           "/node_modules/next/dist/lib/non-nullable.js",
           "/node_modules/next/dist/lib/normalize-path.js",
           "/node_modules/next/dist/lib/oxford-comma-list.js",
           "/node_modules/next/dist/lib/page-types.js",
           "/node_modules/next/dist/lib/patch-incorrect-lockfile.js",
           "/node_modules/next/dist/lib/pick.js",
           "/node_modules/next/dist/lib/picocolors.js",
           "/node_modules/next/dist/lib/pretty-bytes.js",
           "/node_modules/next/dist/lib/realpath.js",
           "/node_modules/next/dist/lib/recursive-copy.js",
           "/node_modules/next/dist/lib/recursive-delete.js",
           "/node_modules/next/dist/lib/recursive-readdir.js",
           "/node_modules/next/dist/lib/redirect-status.js",
           "/node_modules/next/dist/lib/require-instrumentation-client.js",
           "/node_modules/next/dist/lib/resolve-build-paths.js",
           "/node_modules/next/dist/lib/resolve-from.js",
           "/node_modules/next/dist/lib/route-pattern-normalizer.js",
           "/node_modules/next/dist/lib/scheduler.js",
           "/node_modules/next/dist/lib/semver-noop.js",
           "/node_modules/next/dist/lib/server-external-packages.jsonc",
           "/node_modules/next/dist/lib/setup-exception-listeners.js",
           "/node_modules/next/dist/lib/static-env.js",
           "/node_modules/next/dist/lib/try-to-parse-path.js",
           "/node_modules/next/dist/lib/turbopack-warning.js",
           "/node_modules/next/dist/lib/typescript/diagnosticFormatter.js",
           "/node_modules/next/dist/lib/typescript/getTypeScriptConfiguration.js",
           "/node_modules/next/dist/lib/typescript/getTypeScriptIntent.js",
           "/node_modules/next/dist/lib/typescript/missingDependencyError.js",
           "/node_modules/next/dist/lib/typescript/runTypeCheck.js",
           "/node_modules/next/dist/lib/typescript/type-paths.js",
           "/node_modules/next/dist/lib/typescript/writeAppTypeDeclarations.js",
           "/node_modules/next/dist/lib/typescript/writeConfigurationDefaults.js",
           "/node_modules/next/dist/lib/url.js",
           "/node_modules/next/dist/lib/verify-partytown-setup.js",
           "/node_modules/next/dist/lib/verify-root-layout.js",
           "/node_modules/next/dist/lib/verify-typescript-setup.js",
           "/node_modules/next/dist/lib/wait.js",
           "/node_modules/next/dist/lib/with-promise-cache.js",
           "/node_modules/next/dist/lib/worker.js",
           "/node_modules/next/dist/next-devtools/server/shared.js",
           "/node_modules/next/dist/server/*",
           "/node_modules/next/dist/shared/*",
           "/node_modules/next/dist/telemetry/anonymous-meta.js",
           "/node_modules/next/dist/telemetry/detached-flush.js",
           "/node_modules/next/dist/telemetry/events/build.js",
           "/node_modules/next/dist/telemetry/events/index.js",
           "/node_modules/next/dist/telemetry/events/plugins.js",
           "/node_modules/next/dist/telemetry/events/swc-load-failure.js",
           "/node_modules/next/dist/telemetry/events/version.js",
           "/node_modules/next/dist/telemetry/flush-telemetry.js",
           "/node_modules/next/dist/telemetry/post-telemetry-payload.js",
           "/node_modules/next/dist/telemetry/project-id.js",
           "/node_modules/next/dist/telemetry/storage.js",
           "/node_modules/next/dist/trace/index.js",
           "/node_modules/next/dist/trace/report/index.js",
           "/node_modules/next/dist/trace/report/to-json-build.js",
           "/node_modules/next/dist/trace/report/to-json.js",
           "/node_modules/next/dist/trace/report/to-telemetry.js",
           "/node_modules/next/dist/trace/shared.js",
           "/node_modules/next/dist/trace/trace.js",
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
           "/node_modules/typescript/*",
         ]
        `)
      })
    })

    describe('default mode', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        skipDeployment: true,
        dependencies: {
          typescript: '5.9.2',
        },
      })

      if (skipped) {
        return
      }

      it('should not include .next directory in traces despite dynamic fs operations', async () => {
        // This test verifies that the denied_path feature prevents the .next directory
        // from being included in traces. The app/dynamic-read page uses dynamic fs.readFileSync
        // with path.join(process.cwd(), ...) which could theoretically read any file.

        // Check the page-specific trace that has the dynamic fs operations
        const pageTrace = await readNormalizedNFT(
          next,
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
          next,
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
                  "/node_modules/next/dist/server/node-environment-extensions/fast-set-immediate.external.js",
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
                  "/node_modules/next/dist/server/runtime-reacts.external.js",
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
    })
  }
)
