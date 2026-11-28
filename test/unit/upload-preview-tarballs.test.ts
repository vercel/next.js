import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const scriptPath = path.join(
  __dirname,
  '../../scripts/upload-preview-tarballs.js'
)
const commitSha = 'a'.repeat(40)
const baseUrl = 'https://preview-upload.example.test/next'
const tokenUrl = 'https://oidc.example.test/token'
const uploadUrl = 'https://blob.example.test/upload'

async function runUploader(
  packageNames: string[],
  {
    authorizationStatuses = [200],
    uploadStatuses = [200],
    virtualPackageName,
  }: {
    authorizationStatuses?: number[]
    uploadStatuses?: number[]
    virtualPackageName?: string
  } = {}
) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-preview-upload-')
  )
  const calls = {
    tokens: 0,
    authorizations: [] as string[],
    uploads: [] as { url: string; body: Buffer }[],
    delays: [] as number[],
    errors: [] as unknown[],
    exitCode: 0,
  }

  function response(status: number, body: unknown) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Map(),
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }

  try {
    for (const packageName of packageNames) {
      const packageDirectory = path.join(directory, packageName)
      await fs.mkdir(packageDirectory, { recursive: true })
      await fs.writeFile(
        path.join(packageDirectory, 'package.tgz'),
        `archive for ${packageName}`
      )
    }

    const source = await fs.readFile(scriptPath, 'utf8')
    await new vm.Script(source, { filename: scriptPath }).runInNewContext({
      Buffer,
      URL,
      Uint8Array,
      AggregateError,
      require: (specifier: string) => {
        switch (specifier) {
          case 'node:fs/promises':
            if (virtualPackageName !== undefined) {
              return {
                ...fs,
                readdir: async (dir: string) =>
                  dir === directory
                    ? [
                        {
                          name: virtualPackageName,
                          isDirectory: () => true,
                        },
                      ]
                    : ['package.tgz'],
              }
            }
            return fs
          case 'node:path':
            return path
          case 'node:timers/promises':
            return {
              setTimeout: async (delay: number) => {
                calls.delays.push(delay)
              },
            }
          default:
            throw new Error(`Unexpected import: ${specifier}`)
        }
      },
      process: {
        argv: ['node', scriptPath, commitSha, directory],
        env: {
          ACTIONS_ID_TOKEN_REQUEST_URL: tokenUrl,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-request-token',
          PREVIEW_BUILDS_BASE_URL: baseUrl,
        },
        exit: (code: number) => {
          calls.exitCode = code
        },
      },
      console: {
        info: () => {},
        error: (error: unknown) => calls.errors.push(error),
      },
      fetch: async (
        input: string | URL,
        options?: { method?: string; body?: Uint8Array }
      ) => {
        const url = String(input)
        if (url.startsWith(`${tokenUrl}?`)) {
          calls.tokens++
          const payload = Buffer.from(
            JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
          ).toString('base64url')
          return response(200, { value: `test.${payload}.test` })
        }
        if (url.startsWith(`${baseUrl}/commits/${commitSha}/`)) {
          calls.authorizations.push(url)
          const status =
            authorizationStatuses[
              Math.min(
                calls.authorizations.length - 1,
                authorizationStatuses.length - 1
              )
            ]
          return response(status, {
            url: uploadUrl,
            downloadUrl: 'https://blob.example.test/package.tgz',
          })
        }
        if (url === uploadUrl && options?.method === 'PUT' && options.body) {
          calls.uploads.push({ url, body: Buffer.from(options.body) })
          const status =
            uploadStatuses[
              Math.min(calls.uploads.length - 1, uploadStatuses.length - 1)
            ]
          return response(status, {})
        }
        throw new Error(`Unexpected request: ${url}`)
      },
    })
    return calls
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('upload-preview-tarballs', () => {
  it.each([
    'next',
    '@next/env',
    '@vercel/devlow-bench',
    '@next/swc-linux-x64-gnu',
    'Legacy_Name-1.0~preview',
    '@scope/.package',
    '@scope/_package',
  ])('preserves the upload path and bytes for %s', async (packageName) => {
    const calls = await runUploader([packageName])

    expect(calls.exitCode).toBe(0)
    expect(calls.errors).toEqual([])
    expect(calls.tokens).toBe(1)
    expect(calls.authorizations).toEqual([
      `${baseUrl}/commits/${commitSha}/${packageName}`,
    ])
    expect(calls.uploads).toEqual([
      { url: uploadUrl, body: Buffer.from(`archive for ${packageName}`) },
    ])
    expect(calls.delays).toEqual([])
  })

  it.each([
    'next#preview',
    'next?preview',
    'next%preview',
    'next preview',
    'next\n',
    '@scope/pkg#preview',
    '@bad#scope/package',
  ])('rejects %j before requesting a token or upload', async (packageName) => {
    // These Linux artifact names cannot be created in Windows test fixtures.
    const useVirtualDirectory = /[?\n]/.test(packageName)
    const calls = await runUploader(useVirtualDirectory ? [] : [packageName], {
      authorizationStatuses: [400],
      virtualPackageName: useVirtualDirectory ? packageName : undefined,
    })

    expect(calls.exitCode).toBe(1)
    expect(calls.tokens).toBe(0)
    expect(calls.authorizations).toEqual([])
    expect(calls.uploads).toEqual([])
    expect(calls.delays).toEqual([])
    expect(calls.errors).toEqual([
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            cause: expect.objectContaining({
              message: expect.stringContaining('Invalid preview package name'),
            }),
          }),
        ],
      }),
    ])
  })

  it('continues uploading valid packages and reports invalid packages', async () => {
    const calls = await runUploader(['a-invalid#name', 'next'])

    expect(calls.exitCode).toBe(1)
    expect(calls.errors).toHaveLength(1)
    expect(calls.errors[0]).toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: 'Failed to upload a-invalid#name',
          }),
        ],
      })
    )
    expect(calls.tokens).toBe(1)
    expect(calls.authorizations).toEqual([
      `${baseUrl}/commits/${commitSha}/next`,
    ])
    expect(calls.uploads).toEqual([
      { url: uploadUrl, body: Buffer.from('archive for next') },
    ])
    expect(calls.delays).toEqual([])
  })

  it('preserves the already-published response without uploading again', async () => {
    const calls = await runUploader(['next'], { authorizationStatuses: [409] })

    expect(calls.exitCode).toBe(0)
    expect(calls.errors).toEqual([])
    expect(calls.authorizations).toHaveLength(1)
    expect(calls.uploads).toEqual([])
    expect(calls.delays).toEqual([])
  })

  it('still retries transient authorization failures for valid packages', async () => {
    const calls = await runUploader(['next'], {
      authorizationStatuses: [503, 200],
    })

    expect(calls.exitCode).toBe(0)
    expect(calls.errors).toEqual([])
    expect(calls.tokens).toBe(1)
    expect(calls.authorizations).toHaveLength(2)
    expect(calls.uploads).toHaveLength(1)
    expect(calls.delays).toEqual([1000])
  })

  it('still retries transient storage failures for valid packages', async () => {
    const calls = await runUploader(['next'], { uploadStatuses: [503, 200] })

    expect(calls.exitCode).toBe(0)
    expect(calls.errors).toEqual([])
    expect(calls.tokens).toBe(1)
    expect(calls.authorizations).toHaveLength(2)
    expect(calls.uploads).toHaveLength(2)
    expect(calls.delays).toEqual([1000])
  })
})
