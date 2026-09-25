/* eslint-env jest */
import { execFile } from 'child_process'
import { copyFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import {
  getImageOptimizerSandboxConfig,
  SandboxedImageOptimizerWorker,
} from 'next/dist/server/image-optimizer/sandbox-worker'
import type { ImageOptimizerOperation } from 'next/dist/server/image-optimizer/operation'
import { resolveImageOptimizerWorker } from 'next/dist/server/image-optimizer/sandbox-support'
import {
  defaultConfig,
  getNextConfigRuntime,
  type NextConfigComplete,
} from 'next/dist/server/config-shared'

const fixtureWorker = join(__dirname, 'fixtures', 'sandbox-worker-fixture.js')
const integrationWorker = join(
  __dirname,
  'fixtures',
  'sandbox-worker-integration.js'
)
const execFileAsync = promisify(execFile)

const fakeSandboxManager = {
  async initialize() {},
  async wrapWithSandboxArgv(command: string) {
    return {
      argv: ['/bin/sh', '-c', command],
      env: process.env,
    }
  },
  cleanupAfterCommand() {},
  async reset() {},
}

function createWorker(
  options: ConstructorParameters<typeof SandboxedImageOptimizerWorker>[0] = {}
) {
  return new SandboxedImageOptimizerWorker({
    workerPath: fixtureWorker,
    sandboxManager: fakeSandboxManager as never,
    ...options,
  })
}

function operation(href: string): ImageOptimizerOperation {
  return {
    imageUpstream: {
      buffer: Buffer.from('image'),
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
        imgOptTimeoutInSeconds: 1,
        imgOptMozjpeg: true,
      },
    },
    options: {},
  }
}

// The image sandbox and its worker process are not supported on Windows.
// @force-gate !windows
describe('SandboxedImageOptimizerWorker', () => {
  let worker: SandboxedImageOptimizerWorker | undefined

  afterEach(async () => {
    await worker?.close()
    worker = undefined
  })

  it('enables subprocesses by default when sandboxing is supported', async () => {
    await expect(
      resolveImageOptimizerWorker(undefined, async () => undefined)
    ).resolves.toBe(true)
  })

  it('disables subprocesses without probing when explicitly opted out', async () => {
    const check = jest.fn()
    await expect(resolveImageOptimizerWorker(false, check)).resolves.toBe(false)
    expect(check).not.toHaveBeenCalled()
  })

  it.each([
    'unsupported platform win32',
    'bubblewrap not installed',
    'sandbox creation denied',
  ])('only auto mode falls back when %s', async (reason) => {
    const check = async () => reason
    await expect(resolveImageOptimizerWorker(undefined, check)).resolves.toBe(
      false
    )
    await expect(resolveImageOptimizerWorker(true, check)).rejects.toThrow(
      `experimental.imgOptWorker cannot be enabled: ${reason}`
    )
  })

  it('enables explicitly requested subprocesses when supported', async () => {
    await expect(
      resolveImageOptimizerWorker(true, async () => undefined)
    ).resolves.toBe(true)
  })

  it.each(['auto', 'false'])(
    'starts with subprocesses disabled on an unsupported host (%s)',
    async (requested) => {
      const { stdout } = await execFileAsync(
        process.execPath,
        [join(__dirname, 'fixtures/sandbox-worker-unsupported.js'), requested],
        { timeout: 10000 }
      )
      expect(stdout).toContain('WORKER_ENABLED=false')
    }
  )

  it('fails config loading when subprocesses are explicitly enabled on an unsupported host', async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [join(__dirname, 'fixtures/sandbox-worker-unsupported.js'), 'true'],
        { timeout: 10000 }
      )
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'experimental.imgOptWorker cannot be enabled: unsupported platform win32'
      ),
    })
  })

  it('shares shutdown listeners and removes them when workers close', async () => {
    const listenerCounts = () => [
      process.listeners('SIGINT').length,
      process.listeners('SIGTERM').length,
      process.listeners('exit').length,
    ]
    const counts = listenerCounts()
    worker = createWorker()
    const second = createWorker()
    try {
      expect(listenerCounts()).toEqual(counts.map((count) => count + 1))
      await worker.close()
      expect(listenerCounts()).toEqual(counts.map((count) => count + 1))
    } finally {
      await second.close()
    }
    expect(listenerCounts()).toEqual(counts)
  })

  it.each(['SIGINT', 'SIGTERM'])(
    'preserves default %s termination without other signal handlers',
    async (signal) => {
      await expect(
        execFileAsync(
          process.execPath,
          [join(__dirname, 'fixtures', 'sandbox-worker-signal.js'), signal],
          { timeout: 5000 }
        )
      ).rejects.toMatchObject({ signal })
    }
  )

  it('does not launch a worker when shutdown interrupts initialization', async () => {
    const listeners = process.listeners('SIGTERM')
    const serverHandler = () => {}
    process.on('SIGTERM', serverHandler)
    let finishStartup!: () => void
    const startup = new Promise<void>((resolve) => {
      finishStartup = resolve
    })
    const wrapWithSandboxArgv = jest.fn(fakeSandboxManager.wrapWithSandboxArgv)
    worker = createWorker({
      sandboxManager: {
        ...fakeSandboxManager,
        initialize: () => startup,
        wrapWithSandboxArgv,
      } as never,
    })
    const operationPromise = worker
      .runOperation(operation('/echo'))
      .catch((error) => error)
    try {
      // Invoke only the worker's listener, without delivering a signal to Jest.
      const handler = process
        .listeners('SIGTERM')
        .find(
          (listener) =>
            !listeners.includes(listener) && listener !== serverHandler
        )!
      handler('SIGTERM')
      finishStartup()
      expect(await operationPromise).toMatchObject({
        message: 'Image optimizer worker is closed',
      })
      await expect(worker.runOperation(operation('/echo'))).rejects.toThrow(
        'closed'
      )
    } finally {
      finishStartup()
      process.removeListener('SIGTERM', serverHandler)
    }
  })

  it('denies reads by default with explicit runtime exceptions', () => {
    const config = getImageOptimizerSandboxConfig()
    expect(config.filesystem.denyRead).toEqual(['/'])
    expect(config.filesystem.allowWrite).toEqual([])
    expect(config.network.allowedDomains).toEqual([])
    expect(config.filesystem.allowRead).toContain(process.execPath)
    expect(config.filesystem.allowRead).not.toContain(process.cwd())
    expect(config.filesystem.allowRead).not.toContain('/opt/homebrew')
    expect(
      config.filesystem.allowRead.every((path) => !path.includes('*'))
    ).toBe(true)
    expect(config.enableWeakerNestedSandbox).not.toBe(true)
  })

  it('replaces default runtime directories with an explicit read allowlist', () => {
    const config = getImageOptimizerSandboxConfig(fixtureWorker, [])
    expect(config.filesystem.allowRead).not.toContain('/usr/lib')
    expect(config.filesystem.allowRead).not.toContain('/System/Library')
    expect(config.filesystem.allowRead).toContain(process.execPath)
    expect(config.filesystem.allowRead).toContain(fixtureWorker)
    expect(config.filesystem.denyRead).toEqual(['/'])
  })

  it('only grants the source checkout allowance during local development', () => {
    const previous = process.env.NEXT_PRIVATE_LOCAL_DEV
    const dist = join(__dirname, '../../../packages/next/dist')
    const packageJson = join(dist, '../package.json')
    try {
      delete process.env.NEXT_PRIVATE_LOCAL_DEV
      const normal = getImageOptimizerSandboxConfig(fixtureWorker)
      expect(normal.filesystem.allowRead).not.toContain(dist)
      expect(normal.filesystem.allowRead).not.toContain(packageJson)
      process.env.NEXT_PRIVATE_LOCAL_DEV = '1'
      const local = getImageOptimizerSandboxConfig(fixtureWorker)
      expect(local.filesystem.allowRead).toContain(dist)
      expect(local.filesystem.allowRead).toContain(packageJson)
    } finally {
      if (previous === undefined) delete process.env.NEXT_PRIVATE_LOCAL_DEV
      else process.env.NEXT_PRIVATE_LOCAL_DEV = previous
    }
  })

  it.each(['relative/path', '/tmp/*', '/tmp/[abc]', '/tmp/file?'])(
    'rejects ambiguous read allowance %s',
    (path) => {
      expect(() =>
        getImageOptimizerSandboxConfig(fixtureWorker, [path])
      ).toThrow('must be absolute without globs')
    }
  )

  it('passes the read allowlist to sandbox initialization', async () => {
    const initialize = jest.fn().mockResolvedValue(undefined)
    worker = createWorker({
      readAllowlist: [__dirname],
      sandboxManager: { ...fakeSandboxManager, initialize } as never,
    })
    await worker.runOperation(operation('/echo'))
    expect(initialize).toHaveBeenCalledWith(
      getImageOptimizerSandboxConfig(fixtureWorker, [__dirname])
    )
  })

  it('rejects nonexistent configured read paths', () => {
    expect(() =>
      getImageOptimizerSandboxConfig(fixtureWorker, [
        join(__dirname, 'does-not-exist'),
      ])
    ).toThrow(/ENOENT/)
  })

  it('validates and preserves the read allowlist in runtime config', () => {
    const { configSchema } = require('next/dist/server/config-schema')
    const experimental = {
      ...defaultConfig.experimental,
      runtimeServerDeploymentId: true,
      imgOptWorkerReadAllowlist: [__dirname],
    }
    expect(configSchema.safeParse({ experimental }).success).toBe(true)
    expect(
      configSchema.safeParse({
        experimental: { imgOptWorkerReadAllowlist: [123] },
      }).success
    ).toBe(false)
    expect(
      getNextConfigRuntime({
        ...defaultConfig,
        experimental,
      } as unknown as NextConfigComplete).experimental.imgOptWorkerReadAllowlist
    ).toEqual([__dirname])
  })

  it('treats shell metacharacters in the worker path literally', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'image-worker-'))
    const workerPath = join(
      directory,
      "worker ' $HOME $(echo expanded) `echo expanded`\n.js"
    )
    copyFileSync(fixtureWorker, workerPath)
    worker = createWorker({ workerPath })
    try {
      await expect(
        worker.runOperation(operation('/echo'))
      ).resolves.toBeDefined()
    } finally {
      await worker.close()
      worker = undefined
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('multiplexes concurrent transformations', async () => {
    worker = createWorker()
    const outputs = await Promise.all([
      worker.runOperation(operation('/delay?ms=30')),
      worker.runOperation(operation('/echo')),
    ])
    expect(outputs.map((output) => output.result.buffer.toString())).toEqual([
      'image',
      'image',
    ])
  })

  it('enforces the real sandbox and transforms with sharp', async () => {
    if (!['darwin', 'linux'].includes(process.platform)) {
      return
    }
    const { stdout } = await execFileAsync(
      process.execPath,
      [integrationWorker],
      {
        cwd: process.cwd(),
        timeout: 60_000,
      }
    )
    const match = stdout.match(/^SANDBOX_RESULT=(.+)$/m)
    expect(match).not.toBeNull()
    const result = JSON.parse(match![1])
    expect(result).toMatchObject({
      read: expect.stringMatching(/^read-blocked:/),
      readHome: expect.stringMatching(/^read-blocked:/),
      readApplication: expect.stringMatching(/^read-blocked:/),
      readDependency: expect.stringMatching(/^read-blocked:/),
      readCheckout: expect.stringMatching(/^read-blocked:/),
      libraries: Array(6).fill(expect.stringMatching(/^read-blocked:/)),
      customRead: 'read-allowed',
      customOutsideRead: expect.stringMatching(/^read-blocked:/),
      envRead: expect.stringMatching(/^read-blocked:/),
      libraryAliasRead: expect.stringMatching(/^read-blocked:/),
      directoryRead: expect.stringMatching(/^read-blocked:/),
      dependencyData: 'read-allowed',
      dependencyLink: expect.stringMatching(/^read-blocked:/),
      lateEnvRead: expect.stringMatching(/^read-blocked:/),
      // macOS denies the write. Bubblewrap may instead isolate it in the
      // child's mount namespace; in either case it must not reach the host.
      write: expect.stringMatching(/^write-(blocked|allowed)/),
      writeCreated: false,
      network: expect.stringMatching(/^network-blocked:/),
      environment: 'env-blocked',
      serializedError: 'ImageError:fixture transform failed:422:FIXTURE_ERROR',
      crash: expect.stringContaining('exited with code 23'),
      afterCrash: 'image/png',
      timeout: 'Image optimizer worker timed out after 5000ms',
      afterTimeout: 'image/png',
      malformed: 'Image optimizer worker timed out after 5000ms',
      afterMalformed: 'image/png',
      contentType: 'image/webp',
    })
    expect(result.transformError).toBeUndefined()
    expect(result.outputBytes).toBeGreaterThan(0)
  })

  it('rejects all active work after a child crash and respawns', async () => {
    worker = createWorker()
    await expect(
      Promise.all([
        worker.runOperation(operation('/crash')),
        worker.runOperation(operation('/delay?ms=500')),
      ])
    ).rejects.toThrow('exited with code 23')
    await expect(
      worker.runOperation(operation('/echo'))
    ).resolves.toMatchObject({ result: { contentType: 'image/png' } })
  })

  it('kills a worker that exceeds the request watchdog and respawns', async () => {
    worker = createWorker({
      requestTimeoutMs: 500,
      killGraceMs: 50,
    })
    await expect(worker.runOperation(operation('/hang'))).rejects.toThrow(
      'timed out after 500ms'
    )
    await expect(
      worker.runOperation(operation('/echo'))
    ).resolves.toMatchObject({ result: { contentType: 'image/png' } })
  })

  it('preserves errors returned by the worker', async () => {
    worker = createWorker()
    await expect(
      worker.runOperation(operation('/error'))
    ).rejects.toMatchObject({
      name: 'ImageError',
      message: 'fixture transform failed',
      statusCode: 422,
      code: 'FIXTURE_ERROR',
    })
  })

  it('escalates to SIGKILL when a timed-out worker ignores SIGTERM', async () => {
    worker = createWorker({ requestTimeoutMs: 500, killGraceMs: 50 })
    await worker.runOperation(operation('/ignore-term'))
    await expect(worker.runOperation(operation('/hang'))).rejects.toThrow(
      'timed out'
    )
    await expect(worker.runOperation(operation('/echo'))).resolves.toBeDefined()
  })

  it('kills a live worker after a process error before replacing it', async () => {
    worker = createWorker({ killGraceMs: 50 })
    await worker.runOperation(operation('/ignore-term'))
    const child = worker['child']!
    try {
      child.emit('error', new Error('fixture process error'))
      await expect(
        worker.runOperation(operation('/echo'))
      ).resolves.toBeDefined()
      expect(child.signalCode).toBe('SIGKILL')
      expect(worker['child']).not.toBe(child)
    } finally {
      child.kill('SIGKILL')
    }
  })

  it('rejects queued work after sandbox startup fails and can retry', async () => {
    const initialize = jest
      .fn()
      .mockRejectedValueOnce(new Error('sandbox unavailable'))
      .mockResolvedValue(undefined)
    worker = createWorker({
      sandboxManager: { ...fakeSandboxManager, initialize } as never,
    })
    await expect(
      Promise.all([
        worker.runOperation(operation('/echo')),
        worker.runOperation(operation('/echo')),
      ])
    ).rejects.toThrow('sandbox unavailable')
    await expect(worker.runOperation(operation('/echo'))).resolves.toBeDefined()
  })

  it('rejects a failed process spawn and can retry', async () => {
    const wrapWithSandboxArgv = jest
      .fn()
      .mockResolvedValueOnce({
        argv: [join(__dirname, 'does-not-exist')],
        env: process.env,
      })
      .mockImplementation(fakeSandboxManager.wrapWithSandboxArgv)
    worker = createWorker({
      sandboxManager: { ...fakeSandboxManager, wrapWithSandboxArgv } as never,
    })
    await expect(worker.runOperation(operation('/echo'))).rejects.toThrow(
      'ENOENT'
    )
    await expect(worker.runOperation(operation('/echo'))).resolves.toBeDefined()
  })

  it.each(['/malformed', '/invalid-buffer'])(
    'keeps the watchdog armed for an unusable response: %s',
    async (href) => {
      worker = createWorker({
        requestTimeoutMs: 500,
        killGraceMs: 50,
      })
      await expect(worker.runOperation(operation(href))).rejects.toThrow(
        'timed out after 500ms'
      )
      await expect(
        worker.runOperation(operation('/echo'))
      ).resolves.toMatchObject({ result: { contentType: 'image/png' } })
    }
  )

  it('bounds pending request count and releases capacity after completion', async () => {
    worker = createWorker({ maxOperations: 1, maxPendingOperations: 2 })
    const first = worker.runOperation(operation('/delay?ms=30'))
    const second = worker.runOperation(operation('/echo'))
    await expect(worker.runOperation(operation('/echo'))).rejects.toMatchObject(
      {
        statusCode: 503,
      }
    )
    await Promise.all([first, second])
    await expect(worker.runOperation(operation('/echo'))).resolves.toBeDefined()
  })

  it('bounds pending input and previous-output bytes', async () => {
    worker = createWorker({ maxPendingBytes: 9 })
    const first = worker.runOperation(operation('/delay?ms=30'))
    await expect(worker.runOperation(operation('/echo'))).rejects.toThrow(
      'busy'
    )
    await first
    const oversized = operation('/echo')
    oversized.imageUpstream.buffer = Buffer.alloc(10)
    await expect(worker.runOperation(oversized)).rejects.toThrow('busy')
    const withPreviousOutput = operation('/echo')
    withPreviousOutput.options.previousOutput = {
      buffer: Buffer.alloc(5),
      etag: 'previous',
      upstreamEtag: 'source',
    }
    await expect(worker.runOperation(withPreviousOutput)).rejects.toThrow(
      'busy'
    )
    await expect(worker.runOperation(operation('/echo'))).resolves.toBeDefined()
  })

  it('expires queued work during sandbox startup without dispatching it', async () => {
    let finishStartup!: () => void
    const initialize = new Promise<void>((resolve) => {
      finishStartup = resolve
    })
    worker = createWorker({
      requestTimeoutMs: 500,
      sandboxManager: {
        ...fakeSandboxManager,
        initialize: () => initialize,
      } as never,
    })
    try {
      await expect(worker.runOperation(operation('/crash'))).rejects.toThrow(
        'timed out'
      )
    } finally {
      finishStartup()
    }
    await expect(worker.runOperation(operation('/echo'))).resolves.toBeDefined()
  })

  it('rejects pending work when closed', async () => {
    worker = createWorker({
      requestTimeoutMs: 5_000,
      killGraceMs: 50,
    })
    const pending = worker.runOperation(operation('/hang'))
    await worker.close()
    await expect(pending).rejects.toThrow('closed')
    worker = undefined
  })

  it('closes an active worker and rejects both active and queued operations', async () => {
    worker = createWorker({ maxOperations: 1 })
    await worker.runOperation(operation('/echo'))
    const results = Promise.allSettled([
      worker.runOperation(operation('/hang')),
      worker.runOperation(operation('/echo')),
    ])
    // Let the pump dispatch the first request while the second stays queued.
    await Promise.resolve()
    await worker.close()
    expect(await results).toEqual([
      {
        status: 'rejected',
        reason: expect.objectContaining({
          message: 'Image optimizer worker is closed',
        }),
      },
      {
        status: 'rejected',
        reason: expect.objectContaining({
          message: 'Image optimizer worker is closed',
        }),
      },
    ])
    await expect(worker.runOperation(operation('/echo'))).rejects.toThrow(
      'closed'
    )
  })
})
