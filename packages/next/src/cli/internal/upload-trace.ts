import path from 'path'
import fs from 'fs/promises'

const UPLOAD_TRACE_URL = 'https://api.nextjs.org/api/upload-trace'

// V8 CPU profiles are JSON objects starting with {"nodes":
const CPUPROFILE_HEADER = Buffer.from('{"nodes":')

export interface UploadTraceOptions {
  directory?: string
}

function getUploadUrl(): string {
  return process.env.__NEXT_UPLOAD_TRACE_URL_OVERRIDE || UPLOAD_TRACE_URL
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
  if (header.length < 2) {
    console.error(`Error: ${file} is too small to be a valid trace file.`)
    process.exit(1)
  }

  // Must be either gzip-compressed or postcard binary.
  // Reject anything that looks like plaintext/HTML (common in bogus files).
  const firstByte = header[0]
  if (
    firstByte === 0x3c || // '<' (HTML)
    firstByte === 0x0a || // bare newline
    firstByte === 0x0d // bare carriage return
  ) {
    console.error(
      `Error: ${file} does not appear to be a valid Turbopack trace.`
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
    (f) => f.endsWith('.cpuprofile') || f === 'trace-turbopack'
  )

  if (uploadableFiles.length === 0) {
    console.error(`Error: No profile or trace files found in ${profilesDir}.`)
    process.exit(1)
  }

  const uploadUrl = getUploadUrl()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  console.log(
    `Found ${uploadableFiles.length} file(s) in ${profilesDir}. Uploading...`
  )

  const { put } =
    require('next/dist/compiled/@vercel/blob') as typeof import('next/dist/compiled/@vercel/blob')

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
    } else if (file === 'trace-turbopack') {
      validateTurbopackTrace(headerBuf, file)
    }

    const content = await fs.readFile(filePath)
    const blobPathname = `profiles/${timestamp}/${file}`

    const tokenRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname: blobPathname,
          clientPayload: null,
          multipart: false,
        },
      }),
    })

    if (!tokenRes.ok) {
      console.error(
        `Error: Failed to get upload token for ${file} (${tokenRes.status} ${tokenRes.statusText})`
      )
      process.exit(1)
    }

    const { clientToken } = (await tokenRes.json()) as { clientToken: string }

    if (!clientToken) {
      console.error('Error: No client token received from the upload endpoint.')
      process.exit(1)
    }

    const blob = await put(blobPathname, content, {
      access: 'public',
      token: clientToken,
    })

    console.log(`Uploaded ${file}: ${blob.url}`)
  }

  console.log('All files uploaded successfully.')
}
