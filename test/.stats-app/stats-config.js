const clientGlobs = [
  {
    name: 'Client Bundles (main, webpack, commons)',
    globs: [
      '.next/static/runtime/+(main|webpack)-!(*.module.js)',
      '.next/static/chunks/!(*.module.js)'
    ]
  },
  {
    name: 'Client Bundles (main, webpack, commons) Modern',
    globs: [
      '.next/static/runtime/+(main|webpack)-*.module.js',
      '.next/static/chunks/*.module.js'
    ]
  },
  {
    name: 'Client Pages',
    globs: ['.next/static/*/pages/**/!(*.module.js)']
  },
  {
    name: 'Client Pages Modern',
    globs: ['.next/static/*/pages/**/*.module.js']
  },
  {
    name: 'Client Build Manifests',
    globs: ['.next/static/*/_buildManifest*']
  },
  {
    name: 'Rendered Page Sizes',
    globs: ['fetched-pages/**/*.html']
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
  },
  // misc
  {
    srcGlob: '.next/static/*/_buildManifest.js',
    dest: '.next/static/BUILD_ID/_buildManifest.js'
  },
  {
    srcGlob: '.next/static/*/_buildManifest.module.js',
    dest: '.next/static/BUILD_ID/_buildManifest.module.js'
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
              generateBuildId: () => 'BUILD_ID',
              webpack(config) {
                config.optimization.minimize = false
                config.optimization.minimizer = undefined
                return config
              },
              experimental: {
                modern: true,
                granularChunks: true
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
              generateBuildId: () => 'BUILD_ID',
              experimental: {
                modern: true,
                granularChunks: true
              }
            }
          `
        }
      ],
      filesToTrack: clientGlobs,
      // will be output to fetched-pages/${pathname}.html
      pagesToFetch: [
        'http://localhost:$PORT/',
        'http://localhost:$PORT/link',
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
              generateBuildId: () => 'BUILD_ID',
              target: 'serverless',
              experimental: {
                modern: true,
                granularChunks: true
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
