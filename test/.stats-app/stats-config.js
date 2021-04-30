const clientGlobs = [
  {
    name: 'Client Bundles (main, webpack, commons)',
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
    globs: ['.next/static/*/pages/**/*', '.next/static/css/**/*'],
  },
  {
    name: 'Client Build Manifests',
    globs: ['.next/static/*/_buildManifest*'],
  },
  {
    name: 'Rendered Page Sizes',
    globs: ['fetched-pages/**/*.html'],
  },
]

const renames = [
  {
    srcGlob: '.next/static/*/pages',
    dest: '.next/static/BUILD_ID/pages',
  },
  {
    srcGlob: '.next/static/*/pages/**/*',
    removeHash: true,
  },
  {
    srcGlob: '.next/static/runtime/*',
    removeHash: true,
  },
  {
    srcGlob: '.next/static/chunks/*',
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
  appBuildCommand: 'NEXT_TELEMETRY_DISABLED=1 yarn next build',
  appStartCommand: 'NEXT_TELEMETRY_DISABLED=1 yarn next start --port $PORT',
  mainRepo: 'vercel/next.js',
  mainBranch: 'canary',
  autoMergeMain: true,
  configs: [
    {
      title: 'Default Server Mode',
      diff: 'onOutputChange',
      diffConfigFiles: [
        {
          path: 'next.config.js',
          content: `
            module.exports = {
              generateBuildId: () => 'BUILD_ID',
              future: {
                webpack5: true
              },
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
      pagesToBench: [
        'http://localhost:$PORT/',
        'http://localhost:$PORT/error-in-render',
      ],
      benchOptions: {
        reqTimeout: 60,
        concurrency: 50,
        numRequests: 2500,
      },
    },
    {
      title: 'Serverless Mode',
      diff: false,
      renames,
      configFiles: [
        {
          path: 'next.config.js',
          content: `
            module.exports = {
              generateBuildId: () => 'BUILD_ID',
              target: 'serverless'
            }
          `,
        },
      ],
      filesToTrack: [
        ...clientGlobs,
        {
          name: 'Serverless bundles',
          globs: ['.next/serverless/pages/**/*'],
        },
      ],
    },
    {
      title: 'Webpack 4 Mode',
      diff: 'onOutputChange',
      diffConfigFiles: [
        {
          path: 'next.config.js',
          content: `
            module.exports = {
              generateBuildId: () => 'BUILD_ID',
              future: {
                webpack5: false
              },
              webpack(config) {
                config.optimization.minimize = false
                config.optimization.minimizer = undefined
                return config
              }
            }
          `,
        },
      ],
      renames,
      configFiles: [
        {
          path: 'next.config.js',
          content: `
            module.exports = {
              generateBuildId: () => 'BUILD_ID',
              future: {
                webpack5: false
              }
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
      pagesToBench: [
        'http://localhost:$PORT/',
        'http://localhost:$PORT/error-in-render',
      ],
      benchOptions: {
        reqTimeout: 60,
        concurrency: 50,
        numRequests: 2500,
      },
    },
  ],
}
