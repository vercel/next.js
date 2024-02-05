console.time('next-wall-time')
// Usage: node scripts/minimal-server.js <path-to-app-dir-build> <path-to-page>
// This script is used to run a minimal Next.js server in production mode.

process.env.NODE_ENV = 'production'

// Change this to 'experimental' to opt into the React experimental channel (needed for server actions, ppr)
process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = 'next'

let currentNode = null

let outliers = []

const chalk = {
  yellow: (str) => `\x1b[33m${str}\x1b[0m`,
  green: (str) => `\x1b[32m${str}\x1b[0m`,
}

if (process.env.LOG_REQUIRE) {
  const originalCompile = require('module').prototype._compile

  require('module').prototype._compile = function (_content, filename) {
    let parent = currentNode

    currentNode = {
      id: filename,
      selfDuration: 0,
      totalDuration: 0,
      children: [],
    }

    const start = performance.now()
    const result = originalCompile.apply(this, arguments)
    const end = performance.now()

    currentNode.totalDuration = end - start
    currentNode.selfDuration = currentNode.children.reduce(
      (acc, child) => acc - child.selfDuration,
      currentNode.totalDuration
    )

    parent?.children.push(currentNode)
    currentNode = parent || currentNode
    return result
  }
}

function prettyPrint(
  node,
  distDir,
  prefix = '',
  isLast = false,
  isRoot = true
) {
  let duration = `${node.selfDuration.toFixed(
    2
  )}ms / ${node.totalDuration.toFixed(2)}ms`

  if (node.selfDuration > 70) {
    duration = chalk.yellow(duration)
    outliers.push(node)
  }

  let output = `${prefix}${isLast || isRoot ? '└─ ' : '├─ '}${chalk.green(
    path.relative(distDir, node.id)
  )} ${chalk.yellow(duration)}\n`

  const childPrefix = `${prefix}${isRoot ? '  ' : isLast ? '   ' : '│  '}`

  node.children.forEach((child, i) => {
    output += prettyPrint(
      child,
      node.id,
      childPrefix,
      i === node.children.length - 1,
      false
    )
  })

  return output
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
    console.log(`readFile: ${require('path').relative(absoluteAppDir, path)}`)
    return originalReadFile.apply(this, arguments)
  }

  require('fs').readFileSync = function (path, options) {
    readFileSyncCount++
    console.log(
      `readFileSync: ${require('path').relative(absoluteAppDir, path)}`
    )
    return originalReadFileSync.apply(this, arguments)
  }
}

console.time('next-cold-start')

const NextServer = process.env.USE_BUNDLED_NEXT
  ? require('next/dist/compiled/next-server/server.runtime.prod').default
  : require('next/dist/server/next-server').default

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
      })
  })
  .listen(3000, () => {
    console.timeEnd('next-cold-start')
    fetch('http://localhost:3000/' + (process.argv[3] || ''))
      .then((res) => res.text())
      .catch((err) => {
        console.error(err)
      })
      .finally(() => {
        console.timeEnd('next-wall-time')
        if (process.env.LOG_REQUIRE) {
          console.log(
            prettyPrint(currentNode, path.join(absoluteAppDir, distDir))
          )
          if (outliers.length > 0) {
            console.log('Outliers:')
            outliers.forEach((node) => {
              console.log(
                `  ${path.relative(
                  path.join(absoluteAppDir, distDir),
                  node.id
                )} ${node.selfDuration.toFixed(
                  2
                )}ms / ${node.totalDuration.toFixed(2)}ms`
              )
            })
          }
        }
        require('process').exit(0)
      })
  })
