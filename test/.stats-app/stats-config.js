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
    globs: ['.next/static/*/pages/**/*'],
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
    srcGlob: '.next/static/runtime/main-*',
    dest: '.next/static/runtime/main-HASH.js',
  },
  {
    srcGlob: '.next/static/runtime/webpack-*',
    dest: '.next/static/runtime/webpack-HASH.js',
  },
  {
    srcGlob: '.next/static/runtime/polyfills-*',
    dest: '.next/static/runtime/polyfills-HASH.js',
  },
  {
    srcGlob: '.next/static/chunks/commons*',
    dest: '.next/static/chunks/commons.HASH.js',
  },
  {
    srcGlob: '.next/static/chunks/framework*',
    dest: '.next/static/chunks/framework.HASH.js',
  },
  // misc
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
  ],
}
