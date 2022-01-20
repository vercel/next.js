const fs = require('fs')
const os = require('os')
const path = require('path')
const tar = require('next/dist/compiled/tar')

if (process.env.NEXT_SWC_SKIP_INSTALL) {
  process.exit(0)
}

const MAX_VERSIONS_TO_CACHE = 5
const { version } = require('next/package.json')

// @ts-ignore https://nodejs.org/api/report.html
const { glibcVersionRuntime } = process.report.getReport().header
const isGlibc = !!glibcVersionRuntime

/**
  @type {
  [platform: string]: {
    [arch: string]: {
      // function to check if the arch/platform fully matches
      // e.g. check if linux is glibc/musl
      check?: () => {}
      packageName: string
    }[]
  }
}
*/
const packageMap = {
  win32: {
    x64: [
      {
        packageName: '@next/swc-win32-x64-msvc',
      },
    ],
    ia32: [
      {
        packageName: '@next/swc-win32-ia32-msvc',
      },
    ],
    arm64: [
      {
        packageName: '@next/swc-win32-arm64-msvc',
      },
    ],
  },
  linux: {
    x64: [
      {
        packageName: '@next/swc-linux-x64-gnu',
        check: () => isGlibc,
      },
      {
        packageName: '@next/swc-linux-x64-musl',
        check: () => !isGlibc,
      },
    ],
    arm64: [
      {
        packageName: '@next/swc-linux-arm64-gnu',
        check: () => isGlibc,
      },
      {
        packageName: '@next/swc-linux-arm64-musl',
        check: () => !isGlibc,
      },
    ],
    arm: [
      {
        packageName: '@next/swc-linux-arm-gnueabihf',
      },
    ],
  },
  darwin: {
    x64: [
      {
        packageName: '@next/swc-darwin-x64',
      },
    ],
    arm64: [
      {
        packageName: '@next/swc-darwin-arm64',
      },
    ],
  },
  android: {
    arm64: [
      {
        packageName: '@next/swc-android-arm64',
      },
    ],
  },
}

let activePackage = packageMap[process.platform]?.[process.arch]?.find(
  (item) => {
    return typeof item.check === 'undefined' || item.check()
  }
)

if (!activePackage) {
  // TODO: should this be a hard error even though it fails install?
  // should we fallback to wasm in this case?
  console.error(
    `Error: unsupported next-swc platform: ` +
      `${process.platform} ${process.arch} (glibc: ${isGlibc})\n` +
      `Please report this on the feedback thread here: https://github.com/vercel/next.js/discussions/30468`
  )
  process.exit(0)
}

const localFileName = `next-swc.${activePackage.packageName.substr(10)}.node`
const tarFileName = `${activePackage.packageName.substr(6)}-${version}.tgz`
const outputDirectory = path.join(__dirname, 'native')

const exists = (filePath) => {
  return fs.promises
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
}
const rmFile = (filePath) => {
  return fs.promises.unlink(filePath).catch(() => {})
}

;(async () => {
  const outputFilepath = path.join(outputDirectory, localFileName)
  const versionFilepath = path.join(outputDirectory, 'version.txt')

  // check if native folder already has an extracted copy of swc,
  // nothing further is needed if so
  if (
    (await exists(outputFilepath)) &&
    (await fs.promises.readFile(versionFilepath, 'utf8')) === version
  ) {
    return
  }

  // get platform specific cache directory adapted from playwright's handling
  // https://github.com/microsoft/playwright/blob/7d924470d397975a74a19184c136b3573a974e13/packages/playwright-core/src/utils/registry.ts#L141
  const cacheDirectory = (() => {
    let result
    const envDefined = process.env['NEXT_SWC_PATH']

    if (envDefined) {
      result = envDefined
    } else {
      let systemCacheDirectory
      if (process.platform === 'linux') {
        systemCacheDirectory =
          process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
      } else if (process.platform === 'darwin') {
        systemCacheDirectory = path.join(os.homedir(), 'Library', 'Caches')
      } else if (process.platform === 'win32') {
        systemCacheDirectory =
          process.env.LOCALAPPDATA ||
          path.join(os.homedir(), 'AppData', 'Local')
      } else {
        console.error(new Error('Unsupported platform: ' + process.platform))
        process.exit(0)
      }
      result = path.join(systemCacheDirectory, 'next-swc')
    }

    if (!path.isAbsolute(result)) {
      // It is important to resolve to the absolute path:
      //   - for unzipping to work correctly;
      //   - so that registry directory matches between installation and execution.
      // INIT_CWD points to the root of `npm/yarn install` and is probably what
      // the user meant when typing the relative path.
      result = path.resolve(process.env['INIT_CWD'] || process.cwd(), result)
    }
    return result
  })()

  const extractFromTar = async () => {
    await fs.promises.mkdir(outputDirectory).catch((err) => {
      if (err.code !== 'EEXIST') throw err
    })
    const tarFilepath = path.join(cacheDirectory, tarFileName)
    const readStream = fs.createReadStream(tarFilepath)
    const writeStream = fs.createWriteStream(outputFilepath)
    let foundEntry = false

    await new Promise((resolve, reject) => {
      readStream
        .pipe(tar.t())
        .on('entry', (entry) => {
          if (entry.path.endsWith('.node')) {
            foundEntry = true
            entry
              .pipe(writeStream)
              .on('error', (err) => reject(err))
              .on('finish', () => resolve())
          }
        })
        .on('error', (err) => reject(err))
        .on('finish', () => {
          if (!foundEntry) {
            reject(new Error(`Failed to find entry in ${tarFilepath}`))
          }
        })
    })
    await rmFile(versionFilepath)
    await fs.promises.writeFile(versionFilepath, version)
  }

  // check cache first if it exists copy from there
  if (await exists(path.join(cacheDirectory, tarFileName))) {
    await extractFromTar()
    return
  }

  // download fresh copy and populate cache
  const fetch = require('next/dist/compiled/node-fetch')

  const tempFile = path.join(
    cacheDirectory,
    `${tarFileName}.temp-${Date.now()}`
  )
  await fs.promises.mkdir(cacheDirectory, { recursive: true })

  try {
    await fetch(
      `https://registry.npmjs.org/${activePackage.packageName}/-/${tarFileName}`
    ).then((res) => {
      if (!res.ok) {
        throw new Error(`request failed with status ${res.status}`)
      }
      const cacheWriteStream = fs.createWriteStream(tempFile)

      return new Promise((resolve, reject) => {
        res.body
          .pipe(cacheWriteStream)
          .on('error', (err) => reject(err))
          .on('finish', () => resolve())
      }).finally(() => cacheWriteStream.close())
    })
    await fs.promises.rename(tempFile, path.join(cacheDirectory, tarFileName))
    await extractFromTar()

    const cacheFiles = await fs.promises.readdir(cacheDirectory)

    if (cacheFiles.length > MAX_VERSIONS_TO_CACHE) {
      cacheFiles.sort()

      for (let i = MAX_VERSIONS_TO_CACHE - 1; i++; i < cacheFiles.length) {
        await rmFile(path.join(cacheDirectory, cacheFiles[i]))
      }
    }
  } catch (err) {
    await rmFile(tempFile)
    console.error(`Failed to download swc binary from npm`, err)
    process.exit(1)
  }
})()
