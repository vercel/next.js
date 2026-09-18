import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)
const errorPath = process.argv.includes('--error-path')
const wasmArgument = process.argv
  .slice(2)
  .find((argument) => argument.endsWith('.wasm'))
const wasmPath = path.resolve(
  wasmArgument ??
    path.join(
      repoRoot,
      'target/wasm32-wasip1-threads/debug/next_napi_bindings.wasm'
    )
)
const emnapiLinkDir = process.env.EMNAPI_LINK_DIR
assert.ok(
  emnapiLinkDir,
  'EMNAPI_LINK_DIR is missing; source scripts/setup-wasi-env.sh first'
)
const emnapiNodeModules = path.resolve(emnapiLinkDir, '../../..')
const coreUrl = pathToFileURL(
  path.join(emnapiNodeModules, '@emnapi/core/dist/emnapi-core.full.js')
).href
const runtimeUrl = pathToFileURL(
  path.join(emnapiNodeModules, '@emnapi/runtime/dist/emnapi.js')
).href
const require = createRequire(import.meta.url)
const wasiThreadsUrl = pathToFileURL(
  require.resolve('@emnapi/wasi-threads')
).href
const workerPath = path.join(
  repoRoot,
  'packages/next/dist/build/swc/wasi-loader-worker.js'
)

const [
  { instantiateWasiNapiModule },
  { createNapiModule },
  { getDefaultContext },
] = await Promise.all([
  import(
    pathToFileURL(
      path.join(repoRoot, 'packages/next/dist/build/swc/wasi-loader.js')
    ).href
  ),
  import(coreUrl),
  import(runtimeUrl),
])
const napiModule = createNapiModule({
  context: getDefaultContext(),
  asyncWorkPoolSize: 0,
})
const loaded = await instantiateWasiNapiModule({
  bytes: new Uint8Array(await readFile(wasmPath)),
  napiModule,
  args: [wasmPath],
  env: {
    ...process.env,
    TURBO_TASKS_AVAILABLE_PARALLELISM: '2',
  },
  // This is trusted Next.js code, not a sandbox. Matching native path semantics requires host
  // absolute paths to remain guest absolute paths.
  preopens: { '/': '/' },
  workerPath,
  napiModuleSpecifier: coreUrl,
  wasiThreadsModuleSpecifier: wasiThreadsUrl,
  onThreadError(error, threadId) {
    throw new Error(`WASI worker ${threadId ?? 'unknown'} failed`, {
      cause: error,
    })
  },
})

assert.equal(napiModule.exports.getTargetTriple(), 'wasm32-wasip1-threads')
assert.equal(Atomics.load(loaded.threadIds, 0), 2)

let fixturePath
if (errorPath) {
  const fixtureRoot = path.join(
    path.dirname(repoRoot),
    'next-build-wasi-verification'
  )
  await mkdir(fixtureRoot, { recursive: true })
  fixturePath = await mkdtemp(path.join(fixtureRoot, 'internal-error-'))
  await mkdir(path.join(fixturePath, 'app'))
  await symlink(
    path.join(repoRoot, 'node_modules'),
    path.join(fixturePath, 'node_modules'),
    'dir'
  )
  await writeFile(
    path.join(fixturePath, 'package.json'),
    JSON.stringify({ private: true })
  )
  await writeFile(
    path.join(fixturePath, 'app/layout.tsx'),
    'export default function Layout({ children }) { return <html><body>{children}</body></html> }'
  )
  await writeFile(
    path.join(fixturePath, 'app/page.tsx'),
    'export default function Page() { return <main>error path</main> }'
  )
}
const rootPath = fixturePath ? path.dirname(repoRoot) : repoRoot
const projectPath = fixturePath ? path.relative(rootPath, fixturePath) : '.'
let reportedInternalError
const project = await napiModule.exports.projectNew(
  {
    rootPath,
    projectPath,
    distDir: '.next',
    watch: { enable: false },
    nextConfig: JSON.stringify({
      distDir: '.next',
      distDirRoot: `${projectPath}/.next`,
      pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
      ...(errorPath ? { sassOptions: 'invalid' } : {}),
    }),
    env: [],
    defineEnv: { client: [], edge: [], nodejs: [] },
    dev: false,
    encryptionKey: '00000000000000000000000000000000',
    buildId: 'wasi-async-smoke',
    previewProps: {
      previewModeId: '00000000000000000000000000000000',
      previewModeEncryptionKey: '00000000000000000000000000000000',
      previewModeSigningKey: '00000000000000000000000000000000',
    },
    browserslistQuery: 'Chrome 111',
    noMangling: false,
    writeRoutesHashesManifest: false,
    currentNodeJsVersion: process.versions.node,
    isPersistentCachingEnabled: false,
    nextVersion: 'test',
  },
  {
    turbopackMemoryEviction: 'off',
    dependencyTracking: false,
    isCi: false,
    isShortSession: true,
    skipCompaction: true,
  },
  {
    throwTurbopackInternalError(error, options) {
      reportedInternalError =
        error ?? new Error(options?.message ?? 'Turbopack internal error')
      throw reportedInternalError
    },
  }
)
assert.ok(project)
if (errorPath) {
  await assert.rejects(
    napiModule.exports.projectWriteAllEntrypointsToDisk(project, true),
    /Failed to write app endpoint|sass_options must be an object/
  )
  assert.match(String(reportedInternalError), /sass_options must be an object/)
  console.log(
    'release internal error preserved the original Turbopack diagnostic'
  )
}
await napiModule.exports.projectShutdown(project)
if (fixturePath) await rm(fixturePath, { recursive: true, force: true })
console.log(
  'async N-API projectNew and projectShutdown promises resolved through WASI pthread workers'
)
// @emnapi/wasi-threads owns unref'ed Workers, but V8 may retain wasm pthread state long enough to
// delay Node's normal empty-loop exit. This smoke has completed every assertion, so exit directly.
process.exit(0)
