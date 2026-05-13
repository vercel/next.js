import path from 'path'
import fs from 'fs/promises'

const UPLOAD_TRACE_URL = 'https://nextjs.org/api/upload-trace'

// V8 CPU profiles are JSON objects starting with {"nodes":
const CPUPROFILE_HEADER = Buffer.from('{"nodes":')

// Turbopack trace files start with this magic header (written by trace_writer.rs)
const TURBOPACK_TRACE_HEADER = Buffer.from('TRACEv0')

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

function validateTurbopackTrace(header: Buffer, file: string): void {
  if (
    header.length < TURBOPACK_TRACE_HEADER.length ||
    !header
      .subarray(0, TURBOPACK_TRACE_HEADER.length)
      .equals(TURBOPACK_TRACE_HEADER)
  ) {
    console.error(
      `Error: ${file} does not appear to be a valid Turbopack trace (missing TRACEv0 header).`
    )
    process.exit(1)
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
    (f) => f.endsWith('.cpuprofile') || f.endsWith('trace-turbopack')
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
    const headerBuf = Buffer.alloc(16)
    await fd.read(headerBuf, 0, 16, 0)
    await fd.close()

    if (file.endsWith('.cpuprofile')) {
      validateCpuProfile(headerBuf, file)
    } else if (file.endsWith('trace-turbopack')) {
      validateTurbopackTrace(headerBuf, file)
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
