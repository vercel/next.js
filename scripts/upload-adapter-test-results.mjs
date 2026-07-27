import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const RESULT_FILE_SUFFIX = '.results.json'
const DEFAULT_ENDPOINT = 'https://nextjs.org/api/adapter-test-results'
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i
const BOOLEAN_ARGS = new Set(['help', 'dry-run'])
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.turbo',
  'node_modules',
  'dist',
  'out',
  'coverage',
])

function usage() {
  console.log(
    [
      'Collect Jest *.results.json files, zip them, and upload to the adapter test results endpoint.',
      '',
      'Usage:',
      '  node scripts/upload-adapter-test-results.mjs \\',
      '    --results-root ~/dev/next.js \\',
      '    --provider vercel \\',
      '    --secret "$ADAPTER_TEST_RESULTS_SECRET" \\',
      '    --commit-sha "$(git -C ~/dev/next.js rev-parse HEAD)"',
      '',
      'Required:',
      '  --provider <name>       or ADAPTER_TEST_RESULTS_PROVIDER',
      '  --secret <secret>       or ADAPTER_TEST_RESULTS_SECRET',
      '  --commit-sha <sha>      or ADAPTER_TEST_RESULTS_COMMIT_SHA or GITHUB_SHA',
      '',
      'Optional:',
      `  --results-root <path>   default: ${process.cwd()}`,
      `  --endpoint <url>        default: ${DEFAULT_ENDPOINT}`,
      '  --zip-out <path>        write zip to disk before upload',
      '  --dry-run               only collect + zip; skip upload',
      '  --help                  show this message',
    ].join('\n')
  )
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const args = {}

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--') {
      continue
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const separatorIndex = arg.indexOf('=')
    if (separatorIndex > -1) {
      const key = arg.slice(2, separatorIndex)
      const value = arg.slice(separatorIndex + 1)
      args[key] = value
      continue
    }

    const key = arg.slice(2)
    if (BOOLEAN_ARGS.has(key)) {
      args[key] = true
      continue
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }

    args[key] = value
    index += 1
  }

  return args
}

function resolvePathWithHome(inputPath) {
  if (inputPath === '~') {
    return os.homedir()
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2))
  }

  return inputPath
}

function toZipEntryPath(filePath) {
  return filePath.split(path.sep).join('/')
}

async function walkResultFiles(rootDir, currentDir, files) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name)

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue
      }

      await walkResultFiles(rootDir, entryPath, files)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith(RESULT_FILE_SUFFIX)) {
      continue
    }

    const relativePath = path.relative(rootDir, entryPath)
    files.push({
      absolutePath: entryPath,
      relativePath: toZipEntryPath(relativePath),
    })
  }
}

async function collectResultFiles(resultsRoot) {
  /** @type {{ absolutePath: string; relativePath: string }[]} */
  const files = []
  await walkResultFiles(resultsRoot, resultsRoot, files)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return files
}

function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MiB`
}

async function runZipCommand(resultsRoot, files, outputZipPath) {
  const relativePaths = files.map((file) => file.relativePath)

  await new Promise((resolve, reject) => {
    const child = spawn('zip', ['-q', '-9', outputZipPath, '-@'], {
      cwd: resultsRoot,
      stdio: ['pipe', 'ignore', 'pipe'],
    })

    let stderr = ''

    child.on('error', (error) => {
      reject(new Error(`Failed to run zip: ${error.message}`))
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(
        new Error(
          [
            `zip failed with code ${code}${signal ? ` and signal ${signal}` : ''}.`,
            stderr.trim(),
          ]
            .filter(Boolean)
            .join(' ')
        )
      )
    })

    child.stdin.write(`${relativePaths.join('\n')}\n`)
    child.stdin.end()
  })
}

async function createArchive(resultsRoot, files) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'adapter-test-results-')
  )
  const zipPath = path.join(tempDir, 'results.zip')

  try {
    await runZipCommand(resultsRoot, files, zipPath)
    return new Uint8Array(await fs.readFile(zipPath))
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  const args = parseArgs(process.argv)

  if (args.help) {
    usage()
    return
  }

  const provider =
    args.provider || process.env.ADAPTER_TEST_RESULTS_PROVIDER || ''
  const secret = args.secret || process.env.ADAPTER_TEST_RESULTS_SECRET || ''
  const commitSha =
    args['commit-sha'] ||
    process.env.ADAPTER_TEST_RESULTS_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    ''
  const endpoint =
    args.endpoint ||
    process.env.ADAPTER_TEST_RESULTS_ENDPOINT ||
    DEFAULT_ENDPOINT
  const inputRoot = args['results-root'] || process.cwd()
  const resultsRoot = path.resolve(resolvePathWithHome(String(inputRoot)))
  const zipOutArg = args['zip-out']
  const zipOutPath = zipOutArg
    ? path.resolve(resolvePathWithHome(String(zipOutArg)))
    : null
  const dryRun = Boolean(args['dry-run'])

  if (!provider) {
    throw new Error(
      'Missing provider. Pass --provider or ADAPTER_TEST_RESULTS_PROVIDER.'
    )
  }

  if (!secret) {
    throw new Error(
      'Missing secret. Pass --secret or ADAPTER_TEST_RESULTS_SECRET.'
    )
  }

  if (!commitSha || !COMMIT_SHA_PATTERN.test(String(commitSha))) {
    throw new Error(
      'Invalid commit SHA. Pass --commit-sha (7-40 hex chars), ADAPTER_TEST_RESULTS_COMMIT_SHA, or GITHUB_SHA.'
    )
  }

  const stat = await fs.stat(resultsRoot).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(
      `results-root does not exist or is not a directory: ${resultsRoot}`
    )
  }

  console.log(`Collecting ${RESULT_FILE_SUFFIX} files from: ${resultsRoot}`)
  const resultFiles = await collectResultFiles(resultsRoot)

  if (resultFiles.length === 0) {
    throw new Error(`No ${RESULT_FILE_SUFFIX} files found under ${resultsRoot}`)
  }

  console.log(`Found ${resultFiles.length} result files`)
  const archive = await createArchive(resultsRoot, resultFiles)
  console.log(`Created archive (${formatBytes(archive.byteLength)})`)

  if (zipOutPath) {
    await fs.mkdir(path.dirname(zipOutPath), { recursive: true })
    await fs.writeFile(zipOutPath, archive)
    console.log(`Wrote archive to: ${zipOutPath}`)
  }

  if (dryRun) {
    console.log('Dry run complete (skipping upload).')
    return
  }

  console.log(`Uploading to: ${endpoint}`)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/zip',
      'x-adapter-test-results-provider': String(provider),
      'x-adapter-test-results-secret': String(secret),
      'x-adapter-test-results-commit-sha': String(commitSha),
    },
    body: archive,
  })

  const responseText = await response.text()
  let parsedResponse

  try {
    parsedResponse = JSON.parse(responseText)
  } catch {
    parsedResponse = responseText
  }

  if (!response.ok) {
    throw new Error(
      `Upload failed (${response.status} ${response.statusText}): ${
        typeof parsedResponse === 'string'
          ? parsedResponse
          : JSON.stringify(parsedResponse)
      }`
    )
  }

  console.log('Upload succeeded')
  if (typeof parsedResponse === 'string') {
    console.log(parsedResponse)
  } else {
    console.log(JSON.stringify(parsedResponse, null, 2))
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
