const clientGlobs = [
  {
    name: 'Client Bundles (main, webpack, commons)',
    globs: [
      '.next/static/runtime/+(main|webpack)-!(*.module.js)',
      '.next/static/chunks/commons!(*.module.js)'
    ]
  },
  {
    name: 'Client Bundles (main, webpack, commons) Modern',
    globs: [
      '.next/static/runtime/+(main|webpack)-*.module.js',
      '.next/static/chunks/commons.*.module.js'
    ]
  },
  {
    name: 'Client Pages',
    globs: ['.next/static/*/pages/**/!(*.module.js)']
  },
  {
    name: 'Client Pages Modern',
    globs: ['.next/static/*/pages/**/*.module.js']
  }
]

const renames = [
  {
    srcGlob: '.next/static/*/pages',
    dest: '.next/static/BUILD_ID/pages'
  },
  {
    srcGlob: '.next/static/runtime/main-!(*.module.js)',
    dest: '.next/static/runtime/main-HASH.js'
  },
  {
    srcGlob: '.next/static/runtime/webpack-!(*.module.js)',
    dest: '.next/static/runtime/webpack-HASH.js'
  },
  {
    srcGlob: '.next/static/chunks/commons!(*.module.js)',
    dest: '.next/static/chunks/commons.HASH.js'
  },
  // modern
  {
    srcGlob: '.next/static/runtime/main-*.module.js',
    dest: '.next/static/runtime/main-HASH.module.js'
  },
  {
    srcGlob: '.next/static/runtime/webpack-*.module.js',
    dest: '.next/static/runtime/webpack-HASH.module.js'
  },
  {
    srcGlob: '.next/static/chunks/commons*.module.js',
    dest: '.next/static/chunks/commons.HASH.module.js'
  }
]

module.exports = {
  commentHeading: 'Stats from current PR',
  commentReleaseHeading: 'Stats from current release',
  appBuildCommand: 'yarn next build',
  appStartCommand: 'yarn next start --port $PORT',
  mainRepo: 'zeit/next.js',
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
              webpack(config) {
                config.optimization.minimize = false
                config.optimization.minimizer = undefined
                return config
              },
              experimental: {
                modern: true
              }
            }
          `
        }
      ],
      // renames to apply to make file names deterministic
      renames,
      configFiles: [
        {
          path: 'next.config.js',
          content: `
            module.exports = {
              experimental: {
                modern: true
              }
            }
          `
        }
      ],
      filesToTrack: clientGlobs,
      pagesToFetch: [
        'http://localhost:$PORT/link',
        'http://localhost:$PORT/index',
        'http://localhost:$PORT/withRouter'
      ]
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
              target: 'serverless',
              experimental: {
                modern: true
              }
            }
          `
        }
      ],
      filesToTrack: [
        ...clientGlobs,
        {
          name: 'Serverless bundles',
          globs: ['.next/serverless/pages/**/*']
        }
      ]
    }
  ]
}
