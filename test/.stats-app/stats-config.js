const fs = require('fs/promises')
const path = require('path')
const { getDistDir } = require('../lib/next-test-utils')

const clientGlobs = [
  {
    name: 'Client Bundles (main, webpack)',
    globs: [
      `${getDistDir()}/static/runtime/+(main|webpack)-*`,
      `${getDistDir()}/static/chunks/!(polyfills*)`,
    ],
  },
  {
    name: 'Legacy Client Bundles (polyfills)',
    globs: [`${getDistDir()}/static/chunks/+(polyfills)-*`],
  },
  {
    name: 'Client Pages',
    globs: [
      `${getDistDir()}/static/BUILD_ID/pages/!(edge-repeated*)`,
      `${getDistDir()}/static/css/**/*`,
    ],
  },
  {
    name: 'Client Build Manifests',
    globs: [`${getDistDir()}/static/BUILD_ID/_buildManifest*`],
  },
  {
    name: 'Rendered Page Sizes',
    globs: ['fetched-pages/!(edge-repeated*)'],
  },
  {
    name: 'Edge SSR bundle Size',
    globs: [
      `${getDistDir()}/server/pages/edge-ssr.js`,
      `${getDistDir()}/server/app/app-edge-ssr/page.js`,
    ],
    getRequiredFiles: async (nextAppDir, fileName) => {
      if (fileName.startsWith(`${getDistDir()}/server/app`)) {
        const manifestJson = await fs.readFile(
          path.join(nextAppDir, getDistDir(), 'server/middleware-manifest.json')
        )
        const manifest = JSON.parse(manifestJson)
        const manifestFileEntry = path.relative(
          path.join(nextAppDir, getDistDir()),
          path.join(nextAppDir, fileName)
        )

        const functionEntry = Object.values(manifest.functions).find(
          (entry) => {
            return entry.files.includes(manifestFileEntry)
          }
        )

        if (functionEntry === undefined) {
          throw new Error(
            `${manifestFileEntry} is not listed in the files files of any functions in the manifest:\n` +
              JSON.stringify(manifest, null, 2)
          )
        }

        return functionEntry.files.map((file) => {
          return path.join(getDistDir(), file)
        })
      } else {
        return [fileName]
      }
    },
  },
  {
    name: 'Middleware size',
    globs: [
      `${getDistDir()}/server/middleware*.js`,
      `${getDistDir()}/server/edge-runtime-webpack.js`,
    ],
  },
  {
    name: 'Next Runtimes',
    globs: ['node_modules/next/dist/compiled/next-server/**/*.js'],
  },
  {
    name: 'build cache',
    globs: [`${getDistDir()}/cache/**/*`],
  },
]

const renames = [
  {
    srcGlob: `${getDistDir()}/static/chunks/pages`,
    dest: `${getDistDir()}/static/BUILD_ID/pages`,
  },
  {
    srcGlob: `${getDistDir()}/static/BUILD_ID/pages/**/*.js`,
    removeHash: true,
  },
  {
    srcGlob: `${getDistDir()}/static/runtime/*.js`,
    removeHash: true,
  },
  {
    srcGlob: `${getDistDir()}/static/chunks/*.js`,
    removeHash: true,
  },
  {
    srcGlob: `${getDistDir()}/static/*/_buildManifest.js`,
    dest: `${getDistDir()}/static/BUILD_ID/_buildManifest.js`,
  },
]

module.exports = {
  commentHeading: 'Stats from current PR',
  commentReleaseHeading: 'Stats from current release',
  appBuildCommand: 'NEXT_TELEMETRY_DISABLED=1 pnpm next build',
  appStartCommand: 'NEXT_TELEMETRY_DISABLED=1 pnpm next start --port $PORT',
  appDevCommand: 'NEXT_TELEMETRY_DISABLED=1 pnpm next --port $PORT',
  mainRepo: 'vercel/next.js',
  mainBranch: 'canary',
  autoMergeMain: true,
  configs: [
    {
      title: 'Default Build',
      diff: 'onOutputChange',
      diffConfigFiles: [
        {
          path: 'next.config.js',
          content: `
            module.exports = {
              generateBuildId: () => 'BUILD_ID',
              webpack(config) {
                config.optimization.minimize = false
                config.optimization.minimizer = undefined
                return config
              }
            }
          `,
        },
      ],
      // renames to apply to make file names deterministic
      renames,
      configFiles: [
        {
          path: 'next.config.js',
          content: `
          module.exports = {
              generateBuildId: () => 'BUILD_ID'
            }
          `,
        },
      ],
      filesToTrack: clientGlobs,
      // will be output to fetched-pages/${pathname}.html
      pagesToFetch: [
        'http://localhost:$PORT/',
        'http://localhost:$PORT/link',
        'http://localhost:$PORT/withRouter',
      ],
      // TODO: investigate replacing "ab" for this
      // pagesToBench: [
      //   'http://localhost:$PORT/',
      //   'http://localhost:$PORT/error-in-render',
      // ],
      // benchOptions: {
      //   reqTimeout: 60,
      //   concurrency: 50,
      //   numRequests: 2500,
      // },
    },
  ],
}
