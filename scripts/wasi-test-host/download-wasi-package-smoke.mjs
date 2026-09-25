import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)
const packageJson = JSON.parse(
  await readFile(
    path.join(repoRoot, 'packages/next-swc-wasm-wasi/package.json'),
    'utf8'
  )
)
const version = packageJson.version
const tarPath = path.resolve(
  process.argv[2] ?? path.join(repoRoot, `next-swc-wasm-wasi-${version}.tgz`)
)
const scratch = await mkdtemp(
  path.join(path.dirname(repoRoot), 'next-wasi-download-smoke-')
)
const originalFetch = globalThis.fetch
const originalCache = process.env.NEXT_SWC_PATH
const { downloadWasmSwc } = await import(
  pathToFileURL(path.join(repoRoot, 'packages/next/dist/lib/download-swc.js'))
    .href
)

async function assertExtracted(outputDirectory) {
  const extractedPackage = path.join(outputDirectory, '@next/swc-wasm-wasi')
  assert.equal(
    JSON.parse(
      await readFile(path.join(extractedPackage, 'package.json'), 'utf8')
    ).name,
    '@next/swc-wasm-wasi'
  )
  assert.ok(
    (await readFile(path.join(extractedPackage, 'next-swc.wasm32-wasi.wasm')))
      .byteLength > 1_000_000
  )
  for (const runtimeFile of [
    'LICENSE.emnapi',
    'emnapi-core.mjs',
    'emnapi-runtime.mjs',
    'wasi-threads.mjs',
  ]) {
    assert.ok(
      (await readFile(path.join(extractedPackage, runtimeFile))).byteLength >
        100
    )
  }
}

try {
  const archive = await readFile(tarPath)
  const cacheDirectory = path.join(scratch, 'cache')
  const outputDirectory = path.join(scratch, 'downloaded')
  let requestedUrl
  process.env.NEXT_SWC_PATH = cacheDirectory
  globalThis.fetch = async (url) => {
    requestedUrl = String(url)
    return new Response(archive)
  }
  await downloadWasmSwc(version, outputDirectory, 'wasi')
  assert.match(
    requestedUrl,
    new RegExp(
      `/@next/swc-wasm-wasi/-/swc-wasm-wasi-${version.replaceAll('.', '\\.')}.tgz$`
    )
  )
  await assertExtracted(outputDirectory)

  await rm(outputDirectory, { recursive: true, force: true })
  globalThis.fetch = async () => {
    throw new Error('cache hit unexpectedly fetched the package')
  }
  await downloadWasmSwc(version, outputDirectory, 'wasi')
  await assertExtracted(outputDirectory)

  process.env.NEXT_SWC_PATH = path.join(scratch, 'missing-cache')
  globalThis.fetch = async () => new Response('missing', { status: 404 })
  await assert.rejects(
    downloadWasmSwc(version, path.join(scratch, 'missing'), 'wasi'),
    /request failed with status 404/
  )

  process.env.NEXT_SWC_PATH = path.join(scratch, 'corrupt-cache')
  globalThis.fetch = async () => new Response('not a tar archive')
  await assert.rejects(
    downloadWasmSwc(version, path.join(scratch, 'corrupt'), 'wasi')
  )

  console.log(
    '@next/swc-wasm-wasi download, extraction, cache hit, missing version, and corrupt archive passed'
  )
} finally {
  globalThis.fetch = originalFetch
  if (originalCache === undefined) delete process.env.NEXT_SWC_PATH
  else process.env.NEXT_SWC_PATH = originalCache
  await rm(scratch, { recursive: true, force: true })
}
