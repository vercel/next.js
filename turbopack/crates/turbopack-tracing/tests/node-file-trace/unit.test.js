const fs = require('fs')
const { join, relative } = require('path')
const { nodeFileTrace } = require('../out/node-file-trace')
const gracefulFS = require('graceful-fs')
const analyze = require('../out/analyze.js').default

const stat = gracefulFS.promises.stat
const readlink = gracefulFS.promises.readlink
const readFile = gracefulFS.promises.readFile

global._unit = true

const nodeGypTests = [
  'datadog-pprof-node-gyp',
  'microtime-node-gyp',
  'zeromq-node-gyp',
]

const skipOnWindows = [
  'datadog-pprof-node-gyp',
  'yarn-workspaces',
  'yarn-workspaces-base-root',
  'yarn-workspace-esm',
  'asset-symlink',
  'require-symlink',
]
const skipOnMac = []
const skipOnNode20AndBelow = ['module-sync-condition-es']
const skipOnNode22AndAbove = ['module-sync-condition-es-node20']
if (process.platform === 'darwin' && process.arch === 'arm64') {
  skipOnMac.push('microtime-node-gyp')
}
const unitTestDirs = fs.readdirSync(join(__dirname, 'unit'))
const unitTests = [
  ...unitTestDirs.map((testName) => ({ testName, isRoot: false })),
  ...unitTestDirs.map((testName) => ({ testName, isRoot: true })),
]

jest.mock('../out/analyze.js', () => {
  const originalModule = jest.requireActual('../out/analyze.js').default

  return {
    __esModule: true,
    default: jest.fn(originalModule),
  }
})

jest.mock('graceful-fs', () => {
  const originalModule = jest.requireActual('graceful-fs')

  return {
    ...originalModule,
    promises: {
      ...originalModule.promises,
      stat: jest.fn(originalModule.promises.stat),
      readFile: jest.fn(originalModule.promises.readFile),
      readlink: jest.fn(originalModule.promises.readlink),
    },
  }
})

function resetFileIOMocks() {
  analyze.mockClear()
  stat.mockClear()
  readFile.mockClear()
  readlink.mockClear()
}

afterEach(resetFileIOMocks)

for (const { testName, isRoot } of unitTests) {
  const testSuffix = `${testName} from ${isRoot ? 'root' : 'cwd'}`
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10)
  if (
    process.platform === 'win32' &&
    (isRoot || skipOnWindows.includes(testName))
  ) {
    console.log(`Skipping unit test on Windows: ${testSuffix}`)
    continue
  }
  if (process.platform === 'darwin' && skipOnMac.includes(testName)) {
    console.log(`Skipping unit test on macOS: ${testSuffix}`)
    continue
  }
  if (nodeVersion < 22 && skipOnNode20AndBelow.includes(testName)) {
    console.log(`Skipping unit test on Node.js 20 or below: ${testSuffix}`)
    continue
  }
  if (nodeVersion >= 22 && skipOnNode22AndAbove.includes(testName)) {
    console.log(`Skipping unit test on Node.js 22 or above: ${testSuffix}`)
    continue
  }
  const unitPath = join(__dirname, 'unit', testName)

  it(`should correctly trace ${testSuffix}`, async () => {
    // We mock readFile because when node-file-trace is integrated into @now/node
    // this is the hook that triggers TypeScript compilation. So if this doesn't
    // get called, the TypeScript files won't get compiled: Currently this is only
    // used in the tsx-input test:
    const readFileMock = jest.fn(function () {
      const [id] = arguments

      if (id.startsWith('custom-resolution-')) {
        return ''
      }

      // ensure sync readFile works as expected since default is
      // async now
      if (testName === 'wildcard') {
        try {
          return fs.readFileSync(id).toString()
        } catch (err) {
          return null
        }
      }
      return this.constructor.prototype.readFile.apply(this, arguments)
    })

    const nftCache = {}

    const doTrace = async (cached = false) => {
      let inputFileNames = ['input.js']
      let outputFileName = 'output.js'

      if (testName === 'jsx-input') {
        inputFileNames = ['input.jsx']
      }
      if (testName === 'tsx-input') {
        inputFileNames = ['input.tsx']
      }
      if (testName === 'ts-input-esm') {
        inputFileNames = ['input.ts']
      }
      if (testName === 'processed-dependency' && cached) {
        inputFileNames = ['input-cached.js']
        outputFileName = 'output-cached.js'
      }

      if (testName === 'multi-input') {
        inputFileNames.push('input-2.js', 'input-3.js', 'input-4.js')
      }

      // Type: { conditions?: string[] }
      let testOpts = {}
      try {
        testOpts = JSON.parse(
          fs.readFileSync(join(unitPath, 'test-opts.json')).toString()
        )
      } catch {
        // Ignore.
      }

      const { fileList, reasons } = await nodeFileTrace(
        inputFileNames.map((file) => join(unitPath, file)),
        {
          conditions: testOpts.conditions,
          base: isRoot ? '/' : `${__dirname}/../`,
          processCwd: unitPath,
          paths: {
            dep: `${__dirname}/../test/unit/esm-paths/esm-dep.js`,
            'dep/': `${__dirname}/../test/unit/esm-paths-trailer/`,
          },
          cache: nftCache,
          exportsOnly: testName.startsWith('exports-only'),
          ts: true,
          log: true,
          // disable analysis for basic-analysis unit tests
          analysis: !testName.startsWith('basic-analysis'),
          mixedModules: true,
          // Ignore unit test output "actual.js", and ignore GitHub Actions preinstalled packages
          ignore: (str) =>
            str.endsWith('/actual.js') || str.startsWith('usr/local'),
          readFile: readFileMock,
          resolve: testName.startsWith('resolve-hook')
            ? (id, parent) => `custom-resolution-${id}`
            : undefined,
        }
      )

      const normalizeFilesRoot = (f) =>
        (isRoot ? relative(join('./', __dirname, '..'), f) : f).replace(
          /\\/g,
          '/'
        )

      const normalizeInputRoot = (f) =>
        isRoot ? join('./', unitPath, f) : join('test/unit', testName, f)

      const getReasonType = (f) => reasons.get(normalizeInputRoot(f)).type

      if (testName === 'multi-input') {
        const collectFiles = (parent, files = new Set()) => {
          fileList.forEach((file) => {
            if (files.has(file)) return
            const reason = reasons.get(file)

            if (reason.parents && reason.parents.has(parent)) {
              files.add(file)
              collectFiles(file, files)
            }
          })
          return files
        }

        expect(
          [...collectFiles(normalizeInputRoot('input.js'))]
            .map(normalizeFilesRoot)
            .sort()
        ).toEqual([
          'package.json',
          'test/unit/multi-input/asset-2.txt',
          'test/unit/multi-input/asset.txt',
          'test/unit/multi-input/child-1.js',
          'test/unit/multi-input/child-2.js',
          'test/unit/multi-input/input-2.js',
        ])
        expect(
          [...collectFiles(normalizeInputRoot('input-2.js'))]
            .map(normalizeFilesRoot)
            .sort()
        ).toEqual([
          'package.json',
          'test/unit/multi-input/asset-2.txt',
          'test/unit/multi-input/asset.txt',
          'test/unit/multi-input/child-1.js',
          'test/unit/multi-input/child-2.js',
          'test/unit/multi-input/input-2.js',
        ])
        expect(
          [...collectFiles(normalizeInputRoot('input-3.js'))]
            .map(normalizeFilesRoot)
            .sort()
        ).toEqual([
          'package.json',
          'test/unit/multi-input/asset.txt',
          'test/unit/multi-input/child-3.js',
        ])

        expect(
          [...collectFiles(normalizeInputRoot('input-4.js'))]
            .map(normalizeFilesRoot)
            .sort()
        ).toEqual([
          'package.json',
          'test/unit/multi-input/child-4.js',
          'test/unit/multi-input/style.module.css',
        ])

        expect(getReasonType('input.js')).toEqual(['initial', 'dependency'])
        expect(getReasonType('input-2.js')).toEqual(['initial', 'dependency'])
        expect(getReasonType('input-3.js')).toEqual(['initial', 'dependency'])
        expect(getReasonType('input-4.js')).toEqual(['initial', 'dependency'])
        expect(getReasonType('child-1.js')).toEqual(['dependency'])
        expect(getReasonType('child-2.js')).toEqual(['dependency'])
        expect(getReasonType('child-3.js')).toEqual(['dependency'])
        expect(getReasonType('child-4.js')).toEqual(['dependency'])
        expect(getReasonType('asset.txt')).toEqual(['asset'])
        expect(getReasonType('asset-2.txt')).toEqual(['asset'])
        expect(getReasonType('style.module.css')).toEqual([
          'dependency',
          'asset',
        ])
      }
      let sortedFileList = [...fileList].sort()

      if (nodeGypTests.includes(testName)) {
        let foundMatchingBinary = false
        sortedFileList = sortedFileList.filter((file) => {
          if (file.includes('prebuilds') && file.endsWith('.node')) {
            // remove from fileList for expected checking
            // as it will differ per platform
            foundMatchingBinary = true
            fileList.delete(file)
            return false
          }
          return true
        })
        expect(foundMatchingBinary).toBe(true)
      }

      let expected
      try {
        expected = JSON.parse(
          fs.readFileSync(join(unitPath, outputFileName)).toString()
        )
        if (process.platform === 'win32') {
          // When using Windows, the expected output should use backslash
          expected = expected.map((str) => str.replace(/\//g, '\\'))
        }
        if (isRoot) {
          // We set `base: "/"` but we can't hardcode an absolute path because
          // CI will look different than a local machine so we fix the path here.
          expected = expected.map((str) => join(__dirname, '..', str).slice(1))
        }
      } catch (e) {
        console.warn(e)
        expected = []
      }
      try {
        expect(sortedFileList).toEqual(expected)
      } catch (e) {
        console.warn(reasons)
        fs.writeFileSync(
          join(unitPath, 'actual.js'),
          JSON.stringify(sortedFileList, null, 2)
        )
        throw e
      }

      if (cached) {
        // Everything should be cached in the second run, except for `processed-dependency` which adds 1 new input file
        expect(stat).toHaveBeenCalledTimes(0)
        expect(readlink).toHaveBeenCalledTimes(
          testName === 'processed-dependency' ? 1 : 0
        )
        expect(readFile).toHaveBeenCalledTimes(
          testName === 'processed-dependency' ? 1 : 0
        )
        expect(analyze).toHaveBeenCalledTimes(
          testName === 'processed-dependency' ? 1 : 0
        )
      } else {
        // Ensure all cached calls are only called once per file. The expected count is the count of calls unique per path
        const uniqueStatCalls = new Set(stat.mock.calls.map((call) => call[0]))
        const uniqueReadlinkCalls = new Set(
          readlink.mock.calls.map((call) => call[0])
        )
        const uniqueReadFileCalls = new Set(
          readFile.mock.calls.map((call) => call[0])
        )
        const uniqueAnalyzeFileCalls = new Set(
          analyze.mock.calls.map((call) => call[0])
        )
        expect(stat).toHaveBeenCalledTimes(uniqueStatCalls.size)
        expect(readlink).toHaveBeenCalledTimes(uniqueReadlinkCalls.size)
        expect(readFile).toHaveBeenCalledTimes(uniqueReadFileCalls.size)
        expect(analyze).toHaveBeenCalledTimes(uniqueAnalyzeFileCalls.size)
      }

      resetFileIOMocks()
    }
    await doTrace()
    // test tracing again with a populated nftTrace
    expect(nftCache.fileCache).toBeDefined()
    expect(nftCache.statCache).toBeDefined()
    expect(nftCache.symlinkCache).toBeDefined()
    expect(nftCache.analysisCache).toBeDefined()

    try {
      await doTrace(true)
    } catch (err) {
      console.error(`Failed for cached run`)
      throw err
    }

    if (testName === 'tsx-input') {
      expect(readFileMock.mock.calls.length).toBe(2)
    }
  })
}
