import { nextTestSetup, isNextStart } from 'e2e-utils'
import http from 'http'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'

/**
 * Starts a server that mocks the upload-trace token endpoint and the blob store. Records the
 * token requests and the uploaded blobs.
 */
async function startMockServer() {
  const handshakeRequests: any[] = []
  const uploads: Buffer[] = []

  const mockServer = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(chunk as Buffer)
    }
    const raw = Buffer.concat(chunks)
    const body = raw.toString('utf-8')

    let parsed: any = null
    try {
      parsed = JSON.parse(body)
    } catch {
      // Not JSON — binary blob upload
    }

    // Handle the upload-trace token handshake (sends { filename })
    if (parsed && parsed.filename) {
      handshakeRequests.push(parsed)

      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          clientToken: 'vercel_blob_client_TESTSTOREID_dGVzdC5wYXlsb2Fk',
          pathname: `profiles/${parsed.filename}`,
          sessionId: 'test-session-id',
          sessionToken: 'test-session-token',
        })
      )
      return
    }

    // Handle @vercel/blob put() — the actual blob upload
    uploads.push(raw)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        url: 'https://test.blob.vercel-storage.com/profiles/test',
        downloadUrl:
          'https://test.blob.vercel-storage.com/profiles/test?download=1',
        pathname: 'profiles/test',
        contentType: 'application/octet-stream',
        contentDisposition: 'attachment; filename="test"',
      })
    )
  })

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', resolve)
  })

  const address = mockServer.address() as { port: number }
  return {
    url: `http://127.0.0.1:${address.port}`,
    handshakeRequests,
    uploads,
    close: () => mockServer.close(),
  }
}

/** A Turbopack trace with the given header, followed by some row data. */
function trace(header: string): Buffer {
  const rows = Buffer.alloc(256 * 1024)
  for (let i = 0; i < rows.length; i++) {
    rows[i] = (i * 7919) % 251 > 200 ? i % 13 : 0
  }
  return Buffer.concat([Buffer.from(header), rows])
}

const { zstdCompressSync } = zlib as {
  zstdCompressSync?: (data: Buffer) => Buffer
}

// This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
// @force-gate !deploy
describe('upload-trace', () => {
  if (!isNextStart) {
    it('skipped for non-start mode', () => {})
    return
  }

  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    buildCommand: 'pnpm next build --experimental-cpu-prof --internal-trace',
  })

  it('should upload profiles and trace to the mock endpoint after build', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const profilesDir = path.join(next.testDir, '.next-profiles')
    expect(fs.existsSync(profilesDir)).toBe(true)

    const allFiles = fs.readdirSync(profilesDir)
    const cpuProfiles = allFiles.filter((f: string) =>
      f.endsWith('.cpuprofile')
    )
    expect(cpuProfiles.length).toBeGreaterThan(0)

    if (isTurbopack) {
      expect(allFiles).toContain('trace-turbopack.bin')
    }

    const uploadableFiles = allFiles.filter(
      (f: string) => f.endsWith('.cpuprofile') || f === 'trace-turbopack.bin'
    )
    const expectedUploadCount = uploadableFiles.length

    const mockServer = await startMockServer()

    try {
      const result = await next.runCommand(['internal', 'upload-trace'], {
        env: {
          __NEXT_UPLOAD_TRACE_URL_OVERRIDE: mockServer.url,
          VERCEL_BLOB_API_URL: mockServer.url,
        },
      })

      if (result.exitCode !== 0) {
        console.log('upload-trace stdout:', result.stdout)
        console.log('upload-trace stderr:', result.stderr)
      }

      expect(result.exitCode).toBe(0)
      expect(mockServer.handshakeRequests.length).toBe(expectedUploadCount)
      for (const req of mockServer.handshakeRequests) {
        expect(req.filename).toBeTruthy()
      }
      expect(result.cliOutput).toContain('All files uploaded successfully')
    } finally {
      mockServer.close()
    }
  })

  /** Creates a project directory with only a Turbopack trace file in `.next-profiles`. */
  function createProjectWithTrace(name: string, content: Buffer): string {
    const projectDir = path.join(next.testDir, name)
    fs.mkdirSync(path.join(projectDir, '.next-profiles'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, '.next-profiles', 'trace-turbopack.bin'),
      content
    )
    return projectDir
  }

  async function uploadTrace(projectDir: string) {
    const mockServer = await startMockServer()
    try {
      const result = await next.runCommand(
        ['internal', 'upload-trace', projectDir],
        {
          env: {
            __NEXT_UPLOAD_TRACE_URL_OVERRIDE: mockServer.url,
            VERCEL_BLOB_API_URL: mockServer.url,
          },
        }
      )
      return { result, mockServer }
    } finally {
      mockServer.close()
    }
  }

  it('should upload a gzip compressed Turbopack trace unchanged', async () => {
    const content = zlib.gzipSync(trace('TRACEv1'))
    const { result, mockServer } = await uploadTrace(
      createProjectWithTrace('gzip-trace', content)
    )

    expect(result.exitCode).toBe(0)
    expect(mockServer.handshakeRequests.length).toBe(1)
    expect(mockServer.uploads.length).toBe(1)
    expect(mockServer.uploads[0].equals(content)).toBe(true)
    expect(result.cliOutput).toContain('All files uploaded successfully')
  })

  // zstd is only available in Node.js 22.15+ and 23.8+. Without it, zstd traces are accepted by
  // their magic bytes alone, which is covered by the unit tests of `checkTurbopackTrace`.
  ;(zstdCompressSync ? describe : describe.skip)('with zstd support', () => {
    it('should upload a zstd compressed Turbopack trace unchanged', async () => {
      const content = zstdCompressSync!(trace('TRACEv1'))
      const { result, mockServer } = await uploadTrace(
        createProjectWithTrace('zstd-trace', content)
      )

      expect(result.exitCode).toBe(0)
      expect(mockServer.handshakeRequests.length).toBe(1)
      expect(mockServer.uploads.length).toBe(1)
      expect(mockServer.uploads[0].equals(content)).toBe(true)
      expect(result.cliOutput).not.toContain("Can't check the trace version")
      expect(result.cliOutput).toContain('All files uploaded successfully')
    })
  })

  it('should reject a compressed Turbopack trace with an unsupported version', async () => {
    const { result, mockServer } = await uploadTrace(
      createProjectWithTrace('gzip-trace-v0', zlib.gzipSync(trace('TRACEv0')))
    )

    expect(result.exitCode).toBe(1)
    expect(result.cliOutput).toContain(
      'has an unsupported Turbopack trace version (expected TRACEv1, found TRACEv0)'
    )
    expect(mockServer.handshakeRequests.length).toBe(0)
    expect(mockServer.uploads.length).toBe(0)
  })

  it('should fail gracefully when no profiles directory exists', async () => {
    const emptyDir = path.join(next.testDir, 'empty-project')
    fs.mkdirSync(emptyDir, { recursive: true })

    const result = await next.runCommand(
      ['internal', 'upload-trace', emptyDir],
      {
        env: {
          __NEXT_UPLOAD_TRACE_URL_OVERRIDE: 'http://127.0.0.1:1',
        },
      }
    )

    expect(result.exitCode).toBe(1)
    expect(result.cliOutput).toContain('Profiles directory not found')
  })
})
