import { nextTestSetup, isNextStart } from 'e2e-utils'
import http from 'http'
import path from 'path'
import fs from 'fs'

describe('upload-trace', () => {
  if (!isNextStart) {
    it('skipped for non-start mode', () => {})
    return
  }

  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    buildCommand: 'pnpm next build --experimental-cpu-prof --internal-trace',
  })

  if (skipped) return

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

    const handshakeRequests: any[] = []

    const mockServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk as Buffer)
      }
      const body = Buffer.concat(chunks).toString('utf-8')

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
    const mockUrl = `http://127.0.0.1:${address.port}`

    try {
      const result = await next.runCommand(['internal', 'upload-trace'], {
        env: {
          __NEXT_UPLOAD_TRACE_URL_OVERRIDE: mockUrl,
          VERCEL_BLOB_API_URL: mockUrl,
        },
      })

      if (result.exitCode !== 0) {
        console.log('upload-trace stdout:', result.stdout)
        console.log('upload-trace stderr:', result.stderr)
      }

      expect(result.exitCode).toBe(0)
      expect(handshakeRequests.length).toBe(expectedUploadCount)
      for (const req of handshakeRequests) {
        expect(req.filename).toBeTruthy()
      }
      expect(result.cliOutput).toContain('All files uploaded successfully')
    } finally {
      mockServer.close()
    }
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
