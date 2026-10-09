import assert from 'node:assert/strict'
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
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
const emnapiNodeModules =
  process.env.EMNAPI_NODE_MODULES ?? path.resolve(emnapiLinkDir, '../../..')
const coreUrl = pathToFileURL(
  path.join(emnapiNodeModules, '@emnapi/core/dist/emnapi-core.full.js')
).href
const runtimeUrl = pathToFileURL(
  path.join(emnapiNodeModules, '@emnapi/runtime/dist/emnapi.js')
).href
const emnapiRequire = createRequire(
  path.join(emnapiNodeModules, '../package.json')
)
const wasiThreadsUrl = pathToFileURL(
  emnapiRequire.resolve('@emnapi/wasi-threads')
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

const fixtureRoot = path.join(
  path.dirname(repoRoot),
  'next-build-wasi-verification'
)
await mkdir(fixtureRoot, { recursive: true })
const fixturePath = await mkdtemp(
  path.join(fixtureRoot, errorPath ? 'internal-error-' : 'async-work-')
)
await mkdir(path.join(fixturePath, 'app'))
await mkdir(path.join(fixturePath, 'node_modules/next'), { recursive: true })
// The WASI resolver on CI's Node 20.9 cannot traverse the workspace's symlinked
// node_modules/next. Materialize the package in the fixture so the error-path
// smoke actually reaches the Sass loader instead of returning a resolve issue.
await copyFile(
  path.join(repoRoot, 'packages/next/package.json'),
  path.join(fixturePath, 'node_modules/next/package.json')
)
await cp(
  path.join(repoRoot, 'packages/next/dist'),
  path.join(fixturePath, 'node_modules/next/dist'),
  { recursive: true }
)
for (const name of ['react', 'react-dom']) {
  await symlink(
    await realpath(path.join(repoRoot, 'node_modules', name)),
    path.join(fixturePath, 'node_modules', name),
    'dir'
  )
}
await writeFile(
  path.join(fixturePath, 'package.json'),
  JSON.stringify({ private: true })
)
await writeFile(
  path.join(fixturePath, 'app/layout.tsx'),
  `${errorPath ? "import './style.scss'\n" : ''}export default function Layout({ children }) { return <html><body>{children}</body></html> }`
)
await writeFile(
  path.join(fixturePath, 'app/page.tsx'),
  'export default function Page() { return <main>WASI async smoke</main> }'
)
if (errorPath) {
  // Force Sass loader configuration to run rather than relying on incidental graph traversal.
  await writeFile(
    path.join(fixturePath, 'app/style.scss'),
    'main { color: red; }'
  )
}
const rootPath = path.dirname(repoRoot)
const projectPath = path.relative(rootPath, fixturePath)
let reportedInternalError
let project
try {
  const result = await napiModule.exports.projectNew(
    {
      rootPath,
      projectPath,
      additionalRoots: [],
      distDir: path.join(fixturePath, '.next'),
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
  assert.ok(result.value?.project)
  assert.ok(Array.isArray(result.issues))
  project = result.value.project
  if (errorPath) {
    await assert.rejects(
      napiModule.exports.projectWriteAllEntrypointsToDisk(project, true),
      /Failed to write app endpoint|sass_options must be an object/
    )
    assert.match(
      String(reportedInternalError),
      /sass_options must be an object/
    )
    console.log(
      'release internal error preserved the original Turbopack diagnostic'
    )
  }
  await napiModule.exports.projectShutdown(project)
  project = undefined
} finally {
  if (project) await napiModule.exports.projectShutdown(project)
  await rm(fixturePath, { recursive: true, force: true })
}
console.log(
  'async N-API projectNew and projectShutdown promises resolved through WASI pthread workers'
)
// @emnapi/wasi-threads owns unref'ed Workers, but V8 may retain wasm pthread state long enough to
// delay Node's normal empty-loop exit. This smoke has completed every assertion, so exit directly.
process.exit(0)
