const fs = require('fs/promises')
const path = require('path')

const clientGlobs = [
  {
    name: 'Client Bundles (main, webpack)',
    globs: [
      '.next/static/runtime/+(main|webpack)-*',
      '.next/static/chunks/!(polyfills*)',
    ],
  },
  {
    name: 'Legacy Client Bundles (polyfills)',
    globs: ['.next/static/chunks/+(polyfills)-*'],
  },
  {
    name: 'Client Pages',
    globs: [
      '.next/static/BUILD_ID/pages/!(edge-repeated*)',
      '.next/static/css/**/*',
    ],
  },
  {
    name: 'Client Build Manifests',
    globs: ['.next/static/BUILD_ID/_buildManifest*'],
  },
  {
    name: 'Rendered Page Sizes',
    globs: ['fetched-pages/!(edge-repeated*)'],
  },
  {
    name: 'Edge SSR bundle Size',
    globs: [
      '.next/server/pages/edge-ssr.js',
      '.next/server/app/app-edge-ssr/page.js',
    ],
    getRequiredFiles: async (nextAppDir, fileName) => {
      if (fileName.startsWith('.next/server/app')) {
        const manifestJson = await fs.readFile(
          path.join(nextAppDir, '.next/server/middleware-manifest.json')
        )
        const manifest = JSON.parse(manifestJson)
        const manifestFileEntry = path.relative(
          path.join(nextAppDir, '.next'),
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
          return path.join('.next', file)
        })
      } else {
        return [fileName]
      }
    },
  },
  {
    name: 'Middleware size',
    globs: [
      '.next/server/middleware*.js',
      '.next/server/edge-runtime-webpack.js',
    ],
  },
  {
    name: 'Next Runtimes',
    globs: ['node_modules/next/dist/compiled/next-server/**/*.js'],
  },
  {
    name: 'build cache',
    globs: ['.next/cache/**/*'],
  },
]

const renames = [
  {
    srcGlob: '.next/static/chunks/pages',
    dest: '.next/static/BUILD_ID/pages',
  },
  {
    srcGlob: '.next/static/BUILD_ID/pages/**/*.js',
    removeHash: true,
  },
  {
    srcGlob: '.next/static/runtime/*.js',
    removeHash: true,
  },
  {
    srcGlob: '.next/static/chunks/*.js',
    removeHash: true,
  },
  {
    srcGlob: '.next/static/*/_buildManifest.js',
    dest: '.next/static/BUILD_ID/_buildManifest.js',
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
