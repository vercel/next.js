// Usage: node scripts/minimal-server.js <path-to-app-dir>
// This script is used to run a minimal Next.js server in production mode.

process.env.NODE_ENV = 'production'

// Change this to 'experimental' for server actions
process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = 'next'

if (process.env.LOG_REQUIRE) {
  const originalRequire = require('module').prototype.require

  require('module').prototype.require = function (path) {
    const start = performance.now()
    const result = originalRequire.apply(this, arguments)
    const end = performance.now()
    console.log(`${path}, ${end - start}`)

    return result
  }
}

if (process.env.LOG_COMPILE) {
  const originalCompile = require('module').prototype._compile
  const currentDir = process.cwd()
  require('module').prototype._compile = function (content, filename) {
    const strippedFilename = filename.replace(currentDir, '')
    console.time(`Module '${strippedFilename}' compiled`)
    const result = originalCompile.apply(this, arguments)
    console.timeEnd(`Module '${strippedFilename}' compiled`)
    return result
  }
}

const appDir = process.argv[2]
const absoluteAppDir = require('path').resolve(appDir)
process.chdir(absoluteAppDir)

let readFileCount = 0
let readFileSyncCount = 0

if (process.env.LOG_READFILE) {
  const originalReadFile = require('fs').readFile
  const originalReadFileSync = require('fs').readFileSync

  require('fs').readFile = function (path, options, callback) {
    readFileCount++
    return originalReadFile.apply(this, arguments)
  }

  require('fs').readFileSync = function (path, options) {
    readFileSyncCount++
    return originalReadFileSync.apply(this, arguments)
  }
}

console.time('next-cold-start')

const NextServer = process.env.USE_BUNDLED_NEXT
  ? require('next/dist/compiled/minimal-next-server/next-server-cached').default
  : require('next/dist/server/next-server').default

console.timeEnd('next-cold-start')
if (process.env.LOG_READFILE) {
  console.log(`readFileCount: ${readFileCount + readFileSyncCount}`)
}

const path = require('path')

const distDir = '.next'

const compiledConfig = require(path.join(
  absoluteAppDir,
  distDir,
  'required-server-files.json'
)).config

const nextServer = new NextServer({
  conf: compiledConfig,
  dir: '.',
  distDir: distDir,
  minimalMode: true,
  customServer: false,
})

const requestHandler = nextServer.getRequestHandler()

require('http')
  .createServer((req, res) => {
    console.time('next-request')
    readFileCount = 0
    readFileSyncCount = 0

    return requestHandler(req, res)
      .catch((err) => {
        console.error(err)
        res.statusCode = 500
        res.end('Internal Server Error')
      })
      .finally(() => {
        console.timeEnd('next-request')
        if (process.env.LOG_READFILE) {
          console.log(`readFileCount: ${readFileCount + readFileSyncCount}`)
        }
        require('process').exit(0)
      })
  })
  .listen(3000, () => {
    console.timeEnd('next-cold-start')
  })
