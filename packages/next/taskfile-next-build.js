const fs = require('fs').promises
const webpack = require('webpack')
const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const { outputFile } = require('fs-extra')

const generateCachedScript = (filename) => `
const filename = ${JSON.stringify(filename + '.cache')}
const { readFileSync } = require('fs'),
  { Script } = require('vm'),
  { wrap } = require('module'),
  { join } = require('path');
const basename = join(__dirname, filename)

// const source = readFileSync(basename, 'utf-8')

const cachedData =
  !process.pkg &&
  require('process').platform !== 'win32' &&
  readFileSync(join(__dirname, ${JSON.stringify(filename + '.cache')}))
  
  // Retrieve the length of the string buffer from the first 4 bytes of the file
  const stringBufferLength = cachedData.readInt32BE(0);

  // Split the combinedBuffer back into the original string and buffer
  const text = cachedData.slice(4, stringBufferLength + 4).toString('utf-8');

  const buffer = cachedData.slice(stringBufferLength + 4);

const scriptOpts = { filename: ${JSON.stringify(
  filename
)}, columnOffset: 0, cachedData: buffer }

const script = new Script(
  // wrap(source),
  text,
 scriptOpts
)
console.log(script.cachedDataRejected)

script.runInThisContext()(exports, require, module, __filename, __dirname)
`

const generateCachingScript = (filename) => `
// require('./server.runtime.js')
const filename = ${JSON.stringify(filename)}
const { readFileSync } = require('fs'),
  { Script } = require('vm'),
  { wrap } = require('module'),
  { join } = require('path');
const basename = join(__dirname, filename)

const source = wrap(readFileSync(basename, 'utf-8'))

const scriptOpts = { filename, columnOffset: 0 }

const script = new Script(
  source,
  scriptOpts
)
const newfilename = __filename.replace('.caching.js', '')
console.log(__filename.replace('.caching.js', ''), __dirname)
script.runInThisContext()(exports, require, module, newfilename, __dirname)

const buffer = script.createCachedData()

// Convert text to buffer
const stringBuffer = Buffer.from(source);

// Get the length of the string buffer and create a buffer from it
const lengthBuffer = Buffer.alloc(4);
lengthBuffer.writeInt32BE(stringBuffer.length, 0);

// Combine the buffers
const combinedBuffer = Buffer.concat([lengthBuffer, stringBuffer, buffer]);


require('fs').writeFileSync(
  join(__dirname, ${JSON.stringify(filename + '.cache')}),
  combinedBuffer
)
`

async function createCache(file) {
  // const fullpath = path.join(
  //   __dirname,
  //   'dist/compiled/minimal-next-server',
  //   file
  // )
  // const content = await fs.readFile(fullpath, 'utf8')

  // copy to .raw
  // await fs.writeFile(
  //   path.join(__dirname, 'dist/compiled/minimal-next-server', file + '.raw'),
  //   content
  // )

  // await fs.writeFile(
  //   path.join(__dirname, 'dist/compiled/minimal-next-server', file),
  //   generateScript(file)
  // )

  await fs.writeFile(
    path.join(
      __dirname,
      'dist/compiled/minimal-next-server',
      file + '.caching.js'
    ),
    generateCachingScript(file)
  )

  // require(path.join(
  //   __dirname,
  //   'dist/compiled/minimal-next-server',
  //   file + '.caching.js'
  // ))

  // run the node script
  require('child_process').execSync(
    `node ${path.join(
      __dirname,
      'dist/compiled/minimal-next-server',
      file + '.caching.js'
    )}`,
    {
      stdio: 'inherit',
    }
  )

  fs.rm(
    path.join(
      __dirname,
      'dist/compiled/minimal-next-server',
      file + '.caching.js'
    ),
    {
      recursive: true,
      force: true,
    }
  )
}

async function buildNextServer(task) {
  // cleanup old files
  await fs.rm(path.join(__dirname, 'dist/compiled/minimal-next-server'), {
    recursive: true,
    force: true,
  })

  const outputName = 'next-server.js'
  const cachedOutputName = `${outputName}.cache`

  const minimalExternals = [
    'react',
    'react/package.json',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/package.json',
    'react-dom/client',
    'react-dom/server',
    'react-dom/server.browser',
    'react-dom/server.edge',
    'react-server-dom-webpack/client',
    'react-server-dom-webpack/client.edge',
    'react-server-dom-webpack/server.edge',
    'react-server-dom-webpack/server.node',
    'styled-jsx',
    'styled-jsx/style',
    '@opentelemetry/api',
    'next/dist/compiled/@next/react-dev-overlay/dist/middleware',
    'next/dist/compiled/@ampproject/toolbox-optimizer',
    'next/dist/compiled/edge-runtime',
    'next/dist/compiled/@edge-runtime/ponyfill',
    'next/dist/compiled/undici',
    'next/dist/compiled/raw-body',
    'next/dist/server/capsize-font-metrics.json',
    'critters',
    'next/dist/compiled/node-html-parser',
    'next/dist/compiled/compression',
    'next/dist/compiled/jsonwebtoken',
  ].reduce((acc, pkg) => {
    acc[pkg] = pkg
    return acc
  }, {})

  Object.assign(minimalExternals, {
    '/(.*)config$/': 'next/dist/server/config',
    './web/sandbox': 'next/dist/server/web/sandbox',
  })

  // const BundleAnalyzerPlugin =
  //   require('webpack-bundle-analyzer').BundleAnalyzerPlugin
  /** @type {webpack.Configuration} */
  const config = {
    entry: {
      server: path.join(__dirname, 'dist/esm/server/next-server.js'),
      'app-page-render': path.join(
        __dirname,
        'dist/esm/server/future/route-modules/app-page/module.js'
      ),
      'pages-render': path.join(
        __dirname,
        'dist/esm/server/future/route-modules/pages/module.js'
      ),
    },
    target: 'node',
    mode: 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/minimal-next-server'),
      filename: '[name].runtime.js',
      libraryTarget: 'commonjs2',
    },
    // left in for debugging
    optimization: {
      moduleIds: 'named',
      // minimize: false,
      minimize: true,
      // splitChunks: {
      //   chunks: 'all',
      // },
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: {
            format: {
              comments: false,
            },
            compress: {
              passes: 2,
            },
          },
        }),
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.NEXT_MINIMAL': JSON.stringify('true'),
        'process.env.NEXT_RUNTIME': JSON.stringify('nodejs'),
      }),
      // new BundleAnalyzerPlugin({}),
    ],
    stats: {
      // Display bailout reasons
      optimizationBailout: true,
    },
    externals: [minimalExternals],
  }

  const outputFiles = await new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err)

      const outputFiles = stats.toJson().assets.map((asset) => asset.name)

      if (stats.hasErrors()) {
        return reject(new Error(stats.toString('errors-only')))
      } else {
        fs.writeFile(
          path.join(
            __dirname,
            'dist/compiled/minimal-next-server',
            'stats.json'
          ),
          JSON.stringify(stats.toJson()),
          'utf8'
        )
      }
      resolve(outputFiles)
    })
  })

  // await Promise.all(outputFiles.map((file) => createCache(file)))
  // await Promise.all(
  //   outputFiles.map((file) =>
  //     fs.writeFile(
  //       path.join(__dirname, 'dist/compiled/minimal-next-server', file),
  //       generateCachedScript(file)
  //     )
  //   )
  // )

  return
}

module.exports = {
  buildNextServer,
}

if (require.main === module) {
  buildNextServer().then(() => {
    console.log('done')
  })
}
