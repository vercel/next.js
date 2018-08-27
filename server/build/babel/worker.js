// Based losely on babel-cli implementation
// https://github.com/babel/babel/blob/master/packages/babel-cli/src/babel/dir.js
//
// MIT: https://github.com/babel/babel/blob/master/LICENSE
//
import FS from 'fs'
import Path from 'path'
import Chokidar from 'chokidar'
import slash from 'slash'
import babelLoader from 'babel-loader'
import findCacheDir from 'find-cache-dir'
import outputFileSync from 'output-file-sync'
import readdirRecursive from 'fs-readdir-recursive'

process.env.IS_SERVER = true

let building = {}

process.on('message', (message) => {
  handleMessage(message, (msg) => process.send({
    callbackId: message.callbackId,
    ...msg
  }))
})

export async function handleMessage ({cmd, filenames, options}, response) {
  if (cmd === 'watch' || cmd === 'build') {
    let compiledFiles = 0
    for (const filename of filenames) {
      compiledFiles += await handle(filename, filename, filename, options, response, (filename, dest, base, rootFile) => {
        if (cmd === 'watch') {
          const watcher = Chokidar.watch(filename, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
              stabilityThreshold: 50,
              pollInterval: 10
            }
          });

          ['add', 'change'].forEach(function (type) {
            watcher.on(type, function (filename) {
              write(
                filename,
                dest,
                base,
                rootFile,
                options,
                response
              )
              console.log('rebuild', building[filename])
            })
          })
        }
      })
    }
    console.log(cmd, filenames, 'completed', compiledFiles)
    response({
      cmd: 'built',
      compiledFiles
    })
  }
}

async function handle (filenameOrDir, rootFile, requestor, options, response, onBuilt) {
  const base = options.base || Path.dirname(filenameOrDir)
  let relative = Path.relative(base, filenameOrDir)

  const ext = Path.extname(relative)

  if ((ext && !['.js', '.jsx', '.json'].includes(ext)) || /__tests__|node_modules/.test(relative)) {
    return 0
  }

  if (ext === '.json') {
    outputFileSync(Path.join(options.outDir, relative), FS.readFileSync(filenameOrDir))
    return 1
  }

  // remove extension and then append back on .js
  relative = relative.replace(/\.(\w*?)$/, '') + '.js'

  const dest = Path.join(options.outDir, relative)

  if (building[dest]) {
    building[dest].responses.add(response);

    building[dest].parents.add(requestor)
    building[requestor].parents.forEach((a) => {
      building[dest].parents.add(a);
    })
    return 0
  }
  building[dest] = building[filenameOrDir] = {
    responses: new Set([response]),
    parents: new Set(building[requestor] && building[requestor].parents)
  };
  building[dest].parents.add(requestor)

  const stat = FS.statSync(filenameOrDir)

  if (stat.isDirectory(filenameOrDir)) {
    const dirname = filenameOrDir

    let count = 0

    const files = readdir(dirname)
    await Promise.all(files.map(async (filename) => {
      const src = Path.join(dirname, filename)

      const compiled = await handle(src, rootFile, dirname, options, response, onBuilt)
      count += compiled
    }))

    return count
  } else {
    const filename = filenameOrDir
    onBuilt(filename, dest, base, rootFile)
    return write(filename, dest, base, rootFile, options, response, onBuilt)
  }
}

async function write (filename, dest, base, rootFile, options, response, onBuilt) {
  let relative = Path.relative(base, filename)
  // remove extension and then append back on .js
  relative = relative.replace(/\.(\w*?)$/, '') + '.js'

  try {
    const res = await compile(
      filename,
      {
        sourceFileName: slash(Path.relative(options.base, filename)),
        ...options.babelOptions
      }
    )

    if (!res) return 0

    const { modules } = res.metadata
    const fsDeps = modules.imports.concat(
      modules.exports.specifiers.filter(({kind}) => kind === 'external')
    )
      .map(({source}) => source)
      .filter((source) => /^\./.test(source))
    const locals = (await Promise.all(
      fsDeps
        .map((source) => {
          source = Path.resolve(`${relative}/..`, source)
          if (!Path.extname(source)) {
            try {
              FS.statSync(`${source}.js`)
              source = `${source}.js`
            } catch (err1) {
              try {
                FS.statSync(`${source}/index.js`)
                source = `${source}/index.js`
              } catch (err2) {
              /* NOP */
              }
            }
          }
          return handle(source, rootFile, dest, options, response, onBuilt)
        })))
      .reduce((a, b) => a + b, 0)

    outputFileSync(dest, res.code)

    building[filename].responses.forEach((response) => {
      response({
        cmd: 'file-built',
        filename,
        dest,
        locals,
        parents: Array.from(building[filename].parents)
      })
    })

    return locals + 1
  } catch (err) {
    response({cmd: 'error', message: err.message, stack: err.stack})
    return 0
  }
}
function compile (filename, babelOptions) {
  return new Promise((resolve, reject) => {
    let metadata
    const context = {
      resourcePath: filename,
      query: {
        ...babelOptions,
        cacheDirectory: findCacheDir({ name: 'babel-loader-next-server' }),
        metadataSubscribers: ['metadata']
      },
      metadata (_metadata) {
        metadata = _metadata
      },
      addDependency () {},
      async () {
        return context.callback
      },
      callback (err, code, map) {
        if (err) {
          reject(err)
        } else {
          resolve({code, metadata})
        }
      }
    }
    FS.readFile(filename, 'utf8', (err, data) => {
      if (err) {
        reject(err)
      } else {
        babelLoader.call(context, data)
      }
    })
  })
}

function readdir (dirname, includeDotfiles, filter) {
  return readdirRecursive(
    dirname,
    filename =>
      filename[0] !== '.' && (!filter || filter(filename))
  )
}
