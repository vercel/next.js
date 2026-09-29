const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const {
  SandboxedImageOptimizerWorker,
  getImageOptimizerSandboxConfig,
} = require('../../../../packages/next/dist/server/image-optimizer/sandbox-worker')

const fixtureWorker = path.join(__dirname, 'sandbox-worker-fixture.js')
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..')

function operation(href, buffer = Buffer.from('image')) {
  return {
    imageUpstream: {
      buffer,
      contentType: 'image/png',
      cacheControl: null,
      etag: 'source',
    },
    params: { href, width: 64, quality: 75, mimeType: 'image/webp' },
    config: {
      images: { dangerouslyAllowSVG: false, minimumCacheTTL: 60 },
      experimental: {
        imgOptConcurrency: 1,
        imgOptOperationCache: false,
        imgOptMaxInputPixels: 67_108_864,
        imgOptSequentialRead: true,
        imgOptTimeoutInSeconds: 2,
        imgOptMozjpeg: true,
      },
    },
    options: {},
  }
}

async function main() {
  let server
  const homeProbeDirectory = fs.mkdtempSync(
    path.join(os.homedir(), '.next-image-sandbox-')
  )
  const homeProbe = path.join(homeProbeDirectory, 'secret')
  fs.writeFileSync(homeProbe, 'must-not-be-readable')
  const isolatedWorker = path.join(homeProbeDirectory, 'worker.js')
  fs.copyFileSync(fixtureWorker, isolatedWorker)
  const libraryNames = [
    'libprobe.dylib',
    'libprobe.dylib.1',
    'libprobe.so',
    'libprobe.so.1',
    'addon.node',
    'probe.dll',
  ]
  for (const name of libraryNames)
    fs.writeFileSync(path.join(homeProbeDirectory, name), 'library-probe')
  const envFile = path.join(homeProbeDirectory, '.env.production')
  fs.writeFileSync(envFile, 'TEST_SECRET=must-not-leak')
  const libraryAlias = path.join(homeProbeDirectory, 'secret-alias.so')
  fs.symlinkSync(envFile, libraryAlias)
  const disguisedDirectory = path.join(homeProbeDirectory, 'directory.so')
  fs.mkdirSync(disguisedDirectory)
  fs.writeFileSync(path.join(disguisedDirectory, 'secret.txt'), 'must-not-leak')
  const dependencies = path.join(homeProbeDirectory, 'node_modules')
  fs.mkdirSync(dependencies)
  fs.writeFileSync(path.join(dependencies, 'data.json'), '{}')
  fs.symlinkSync(envFile, path.join(dependencies, 'secret-link'))
  const previousSecret = process.env.NEXT_IMAGE_SANDBOX_SECRET
  process.env.NEXT_IMAGE_SANDBOX_SECRET = 'must-not-leak'
  let worker = new SandboxedImageOptimizerWorker({
    workerPath: isolatedWorker,
    requestTimeoutMs: 5000,
    killGraceMs: 50,
  })
  try {
    const probeRead = async (file) => {
      const output = await worker.runOperation(
        operation(`/read?path=${encodeURIComponent(file)}`)
      )
      return output.diagnostics[0].message
    }
    const read = await worker.runOperation(
      operation(
        `/read?path=${encodeURIComponent(path.join(projectRoot, 'package.json'))}`
      )
    )
    const readHome = await worker.runOperation(
      operation(`/read?path=${encodeURIComponent(homeProbe)}`)
    )
    const readApplication = await worker.runOperation(
      operation(`/read?path=${encodeURIComponent(__filename)}`)
    )
    const readDependency = await worker.runOperation(
      operation(
        `/read?path=${encodeURIComponent(require.resolve('next/package.json'))}`
      )
    )
    const libraries = await Promise.all(
      libraryNames.map((name) => probeRead(path.join(homeProbeDirectory, name)))
    )
    const envRead = await probeRead(envFile)
    const libraryAliasRead = await probeRead(libraryAlias)
    const directoryRead = await probeRead(
      path.join(disguisedDirectory, 'secret.txt')
    )
    const dependencyData = await probeRead(path.join(dependencies, 'data.json'))
    const dependencyLink = await probeRead(
      path.join(dependencies, 'secret-link')
    )
    const lateEnv = path.join(homeProbeDirectory, '.env.late')
    fs.writeFileSync(lateEnv, 'TEST_SECRET=must-not-leak')
    const lateEnvRead = await probeRead(lateEnv)
    const writePath = path.join(__dirname, 'sandbox-write-probe')
    const write = await worker.runOperation(
      operation(`/write?path=${encodeURIComponent(writePath)}`)
    )

    server = net.createServer()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const network = await worker.runOperation(
      operation(`/network?port=${address.port}`)
    )

    const environment = await worker.runOperation(
      operation('/env?name=NEXT_IMAGE_SANDBOX_SECRET')
    )

    let serializedError
    try {
      await worker.runOperation(operation('/error'))
    } catch (error) {
      serializedError = `${error.name}:${error.message}:${error.statusCode}:${error.code}`
    }

    let crash
    try {
      await worker.runOperation(operation('/crash'))
    } catch (error) {
      crash = error.message
    }
    const afterCrash = await worker.runOperation(operation('/echo'))

    let timeout
    try {
      await worker.runOperation(operation('/hang'))
    } catch (error) {
      timeout = error.message
    }
    const afterTimeout = await worker.runOperation(operation('/echo'))

    let malformed
    try {
      await worker.runOperation(operation('/malformed'))
    } catch (error) {
      malformed = error.message
    }
    const afterMalformed = await worker.runOperation(operation('/echo'))

    // Explicit directory allowances trust all contents, regardless of suffix.
    const trustedDirectory = path.join(homeProbeDirectory, 'trusted-runtime')
    fs.mkdirSync(trustedDirectory)
    const customFile = path.join(trustedDirectory, '.env')
    fs.writeFileSync(customFile, 'explicitly-readable')
    await worker.close()
    worker = new SandboxedImageOptimizerWorker({
      workerPath: isolatedWorker,
      readAllowlist: [
        ...getImageOptimizerSandboxConfig(isolatedWorker).filesystem.allowRead,
        trustedDirectory,
      ],
    })
    const customRead = await probeRead(customFile)
    const customOutsideRead = await probeRead(envFile)

    await worker.close()
    worker = new SandboxedImageOptimizerWorker()
    const image = fs.readFileSync(
      path.join(projectRoot, 'test/unit/image-optimizer/images/test.png')
    )
    const transformed = await worker.runOperation(operation('/test.png', image))

    console.log(
      `SANDBOX_RESULT=${JSON.stringify({
        read: read.diagnostics[0].message,
        readHome: readHome.diagnostics[0].message,
        readApplication: readApplication.diagnostics[0].message,
        readDependency: readDependency.diagnostics[0].message,
        libraries,
        customRead,
        customOutsideRead,
        envRead,
        libraryAliasRead,
        directoryRead,
        dependencyData,
        dependencyLink,
        lateEnvRead,
        write: write.diagnostics[0].message,
        writeCreated: fs.existsSync(writePath),
        network: network.diagnostics[0].message,
        environment: environment.diagnostics[0].message,
        serializedError,
        crash,
        afterCrash: afterCrash.result.contentType,
        timeout,
        afterTimeout: afterTimeout.result.contentType,
        malformed,
        afterMalformed: afterMalformed.result.contentType,
        contentType: transformed.result.contentType,
        outputBytes: transformed.result.buffer.byteLength,
        transformError: transformed.result.error?.message,
      })}`
    )
  } finally {
    fs.rmSync(homeProbeDirectory, { recursive: true, force: true })
    if (previousSecret === undefined) {
      delete process.env.NEXT_IMAGE_SANDBOX_SECRET
    } else {
      process.env.NEXT_IMAGE_SANDBOX_SECRET = previousSecret
    }
    await worker.close()
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
