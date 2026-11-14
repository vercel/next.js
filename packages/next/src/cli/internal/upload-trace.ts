import path from 'path'
import fs from 'fs/promises'
import zlib from 'zlib'
import type { Transform } from 'stream'

const UPLOAD_TRACE_URL = 'https://nextjs.org/api/upload-trace'

// V8 CPU profiles are JSON objects starting with {"nodes":
const CPUPROFILE_HEADER = Buffer.from('{"nodes":')

// Turbopack trace files start with this magic header, including the trace format
// version (written by trace_writer.rs, `TRACE_HEADER` in turbopack-trace-utils)
const TURBOPACK_TRACE_HEADER = Buffer.from('TRACEv1')
const TURBOPACK_TRACE_HEADER_PREFIX = Buffer.from('TRACEv')

// Turbopack traces can be compressed with gzip or zstd (`NEXT_TURBOPACK_TRACING=1,gz` or
// `NEXT_TURBOPACK_TRACING=1,zstd`). They are uploaded as they are, but the trace header is
// checked after decompressing the start of the file.
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b])
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * How much of a Turbopack trace is read to check its header. For compressed traces this needs to
 * cover the first compressed block (up to 128 KB of uncompressed data for zstd).
 */
const TRACE_HEADER_CHECK_READ_SIZE = 512 * 1024
/** How much of a CPU profile is read to check its header. */
const CPUPROFILE_HEADER_CHECK_READ_SIZE = 16

const PROGRESS_CHUNK_SIZE = 64 * 1024 // 64 KB

export interface UploadTraceOptions {
  directory?: string
}

function getUploadUrl(): string {
  return process.env.__NEXT_UPLOAD_TRACE_URL_OVERRIDE || UPLOAD_TRACE_URL
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function renderProgressBar(current: number, total: number): string {
  const width = 30
  const ratio = Math.min(current / total, 1)
  const filled = Math.round(width * ratio)
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
  const percent = (ratio * 100).toFixed(0).padStart(3)
  return `  [${bar}] ${percent}% ${formatBytes(current)}/${formatBytes(total)}`
}

function createProgressStream(
  content: Buffer,
  onProgress: (bytesRead: number) => void
): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= content.length) {
        controller.close()
        return
      }
      const end = Math.min(offset + PROGRESS_CHUNK_SIZE, content.length)
      controller.enqueue(content.subarray(offset, end))
      offset = end
      onProgress(offset)
    },
  })
}

function validateCpuProfile(header: Buffer, file: string): void {
  if (
    header.length < CPUPROFILE_HEADER.length ||
    !header.subarray(0, CPUPROFILE_HEADER.length).equals(CPUPROFILE_HEADER)
  ) {
    console.error(
      `Error: ${file} does not appear to be a valid V8 CPU profile.`
    )
    process.exit(1)
  }
}

/** Creates a zstd decompression stream. */
export type CreateZstdDecompress = () => Transform

/**
 * Returns Node.js's zstd decompression, or `null` when this Node.js version doesn't support zstd
 * (it was added in Node.js 22.15 and 23.8).
 */
function getCreateZstdDecompress(): CreateZstdDecompress | null {
  const { createZstdDecompress } = zlib as {
    createZstdDecompress?: CreateZstdDecompress
  }
  return typeof createZstdDecompress === 'function'
    ? () => createZstdDecompress()
    : null
}

/**
 * Decompresses `data` with `decompress` until at least `length` bytes are available and returns
 * them. Returns fewer bytes when the data ends or is invalid before that. Only as much is
 * decompressed as needed, so a small, highly compressed input doesn't use a lot of memory.
 */
function decompressStart(
  decompress: Transform,
  data: Buffer,
  length: number
): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = () => {
      if (done) return
      done = true
      decompress.destroy()
      resolve(Buffer.concat(chunks).subarray(0, length))
    }
    decompress.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      size += chunk.length
      if (size >= length) finish()
    })
    // `data` is usually only the start of the file, so the stream ends with an error
    decompress.on('error', finish)
    decompress.on('end', finish)
    decompress.end(data)
  })
}

export type TurbopackTraceCheck =
  | { valid: true; warning?: string }
  | { valid: false; error: string }

/**
 * Checks that a Turbopack trace file has the supported `TRACEv1` header. `start` is the start
 * of the file (`TRACE_HEADER_CHECK_READ_SIZE` bytes, or the whole file if it is smaller). gzip
 * and zstd compressed traces are decompressed to check the header. When Node.js doesn't support
 * zstd (`createZstdDecompress` is `null`), zstd compressed files are accepted without checking
 * the header.
 */
export async function checkTurbopackTrace(
  start: Buffer,
  file: string,
  createZstdDecompress: CreateZstdDecompress | null = getCreateZstdDecompress()
): Promise<TurbopackTraceCheck> {
  let header = start
  if (startsWith(start, GZIP_MAGIC)) {
    header = await decompressStart(
      zlib.createGunzip(),
      start,
      TURBOPACK_TRACE_HEADER.length
    )
  } else if (startsWith(start, ZSTD_MAGIC)) {
    if (!createZstdDecompress) {
      return {
        valid: true,
        warning: `Warning: Can't check the trace version of ${file}, since this version of Node.js doesn't support zstd.`,
      }
    }
    header = await decompressStart(
      createZstdDecompress(),
      start,
      TURBOPACK_TRACE_HEADER.length
    )
  }

  const actual = header.subarray(0, TURBOPACK_TRACE_HEADER.length)
  if (actual.equals(TURBOPACK_TRACE_HEADER)) {
    return { valid: true }
  }
  if (
    actual.length === TURBOPACK_TRACE_HEADER.length &&
    startsWith(actual, TURBOPACK_TRACE_HEADER_PREFIX)
  ) {
    return {
      valid: false,
      error: `Error: ${file} has an unsupported Turbopack trace version (expected ${TURBOPACK_TRACE_HEADER}, found ${actual}). Capture the trace again with this version of Next.js.`,
    }
  }
  return {
    valid: false,
    error: `Error: ${file} does not appear to be a valid Turbopack trace (missing ${TURBOPACK_TRACE_HEADER} header).`,
  }
}

function startsWith(data: Buffer, prefix: Buffer): boolean {
  return (
    data.length >= prefix.length &&
    data.subarray(0, prefix.length).equals(prefix)
  )
}

async function validateTurbopackTrace(
  start: Buffer,
  file: string
): Promise<void> {
  const result = await checkTurbopackTrace(start, file)
  if (!result.valid) {
    console.error(result.error)
    process.exit(1)
  }
  if (result.warning) {
    console.warn(result.warning)
  }
}

export async function uploadTraceToBlob(
  options: UploadTraceOptions
): Promise<void> {
  const dir = options.directory || process.cwd()
  const profilesDir = path.join(dir, '.next-profiles')

  let entries: string[]
  try {
    entries = await fs.readdir(profilesDir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        `Error: Profiles directory not found at ${profilesDir}. Run "next build --experimental-cpu-prof" or "next build --internal-trace" first.`
      )
      process.exit(1)
    }
    throw err
  }

  const uploadableFiles = entries.filter(
    (f) => f.endsWith('.cpuprofile') || f.endsWith('trace-turbopack.bin')
  )

  if (uploadableFiles.length === 0) {
    console.error(`Error: No profile or trace files found in ${profilesDir}.`)
    process.exit(1)
  }

  const uploadUrl = getUploadUrl()

  console.log(`Found ${uploadableFiles.length} file(s) in ${profilesDir}.`)
  console.log(`Uploading to the Next.js team...`)

  const { put } =
    require('next/dist/compiled/@vercel/blob') as typeof import('next/dist/compiled/@vercel/blob')

  let sessionId: string | undefined
  let sessionToken: string | undefined
  let uploadedCount = 0

  for (const file of uploadableFiles) {
    const filePath = path.join(profilesDir, file)

    const stat = await fs.stat(filePath)
    if (stat.size === 0) {
      console.warn(`Skipping ${file}: file is empty.`)
      continue
    }

    const fd = await fs.open(filePath, 'r')
    const readSize = file.endsWith('.cpuprofile')
      ? CPUPROFILE_HEADER_CHECK_READ_SIZE
      : TRACE_HEADER_CHECK_READ_SIZE
    let headerBuf = Buffer.alloc(Math.min(stat.size, readSize))
    try {
      const { bytesRead } = await fd.read(headerBuf, 0, headerBuf.length, 0)
      headerBuf = headerBuf.subarray(0, bytesRead)
    } finally {
      await fd.close()
    }

    if (file.endsWith('.cpuprofile')) {
      validateCpuProfile(headerBuf, file)
    } else if (file.endsWith('trace-turbopack.bin')) {
      await validateTurbopackTrace(headerBuf, file)
    }

    const content = await fs.readFile(filePath)

    const tokenRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: file,
        ...(sessionId && sessionToken ? { sessionId, sessionToken } : {}),
      }),
    })

    if (!tokenRes.ok) {
      console.error(
        `Error: Failed to get upload token for ${file} (${tokenRes.status} ${tokenRes.statusText})`
      )
      process.exit(1)
    }

    const tokenBody = (await tokenRes.json()) as {
      clientToken: string
      pathname: string
      sessionId: string
      sessionToken: string
    }

    if (!tokenBody.clientToken || !tokenBody.pathname) {
      console.error('Error: Invalid response from the upload endpoint.')
      process.exit(1)
    }

    if (!sessionId) {
      sessionId = tokenBody.sessionId
      sessionToken = tokenBody.sessionToken
    }

    const totalSize = content.length

    if (process.stdout.isTTY) {
      const stream = createProgressStream(content, (bytesRead) => {
        process.stdout.write(`\r${renderProgressBar(bytesRead, totalSize)}`)
      })

      await put(tokenBody.pathname, stream, {
        access: 'private',
        token: tokenBody.clientToken,
      })

      process.stdout.write('\r' + ' '.repeat(80) + '\r')
    } else {
      await put(tokenBody.pathname, content, {
        access: 'private',
        token: tokenBody.clientToken,
      })
    }

    uploadedCount++
    console.log(`Uploaded ${file} (${formatBytes(totalSize)})`)
  }

  if (uploadedCount === 0) {
    console.error('Error: No files were uploaded (all candidates were empty).')
    process.exit(1)
  }

  if (sessionId) {
    console.log(`\nUpload session: ${sessionId}`)
  }
  console.log('All files uploaded successfully.')
}
