const fs = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { createHash } = require('node:crypto')

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function checkEditorTypes({
  packageDir,
  inputDir,
  evidenceDir,
  matcherResultTypes = false,
}) {
  const tools = path.join(evidenceDir, 'tools')
  await fs.mkdir(tools, { recursive: true })
  let sequence = 0
  async function run(name, executable, args, cwd, expected = 0) {
    const capture = path.join(
      tools,
      `${String(++sequence).padStart(2, '0')}-${name}`
    )
    await fs.mkdir(capture)
    const environment = {
      ...process.env,
      npm_config_cache: path.join(evidenceDir, 'npm-cache'),
      XDG_CACHE_HOME: path.join(evidenceDir, 'cache'),
      TMPDIR: path.join(evidenceDir, 'tmp'),
    }
    await fs.mkdir(environment.TMPDIR, { recursive: true })
    await fs.writeFile(
      path.join(capture, 'request.json'),
      JSON.stringify({ executable, args, cwd })
    )
    const operation = promisify(execFile)(executable, args, {
      cwd,
      env: environment,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    })
    const child = operation.child
    child.stdin?.end()
    let close = null
    let stdoutClosed = false
    let stderrClosed = false
    child.once('close', (code, signal) => {
      close = { code, signal }
    })
    child.stdout?.once('close', () => {
      stdoutClosed = true
    })
    child.stderr?.once('close', () => {
      stderrClosed = true
    })
    let stdout = ''
    let stderr = ''
    let error = null
    try {
      const actual = await operation
      stdout = actual.stdout
      stderr = actual.stderr
    } catch (cause) {
      stdout = cause.stdout ?? ''
      stderr = cause.stderr ?? ''
      error = {
        name: cause.name,
        message: cause.message,
        code: cause.code,
        signal: cause.signal,
        killed: cause.killed,
      }
    }
    const owner = {
      originalPID: child.pid,
      exitCode: child.exitCode,
      signalCode: child.signalCode,
      close,
      stdoutClosed,
      stderrClosed,
      stdinDestroyed: child.stdin?.destroyed ?? true,
      error,
    }
    await Promise.all([
      fs.writeFile(path.join(capture, 'stdout.txt'), stdout),
      fs.writeFile(path.join(capture, 'stderr.txt'), stderr),
      fs.writeFile(
        path.join(capture, 'owner.json'),
        JSON.stringify(owner, null, 2)
      ),
    ])
    if (
      !close ||
      close.code !== expected ||
      close.signal !== null ||
      child.exitCode !== expected ||
      child.signalCode !== null ||
      !stdoutClosed ||
      !stderrClosed ||
      !owner.stdinDestroyed
    ) {
      throw new Error(
        `Editor type tool ${name} failed; original raw result: ${capture}`
      )
    }
    return { stdout, stderr, owner }
  }

  // `pnpm exec` does not always set npm_execpath. Preserve its selected CLI
  // when available, otherwise use the ordinary pnpm executable from PATH.
  const manager = process.env.npm_execpath
  const managerExecutable = manager ? process.execPath : 'pnpm'
  const managerPrefix = manager ? [manager] : []
  const version = await run(
    'pnpm-version',
    managerExecutable,
    [...managerPrefix, '--version'],
    packageDir
  )
  const expectedManager = JSON.parse(
    await fs.readFile(path.join(packageDir, '../../package.json'), 'utf8')
  ).packageManager
  if (`pnpm@${version.stdout.trim()}` !== expectedManager)
    throw new Error('Editor package check requires the repository pnpm version')
  const managerBindings = []
  async function runPinnedManager(name, args, cwd, projectMetadata) {
    const before = await fs.readFile(projectMetadata)
    if (JSON.parse(before).packageManager !== expectedManager)
      throw new Error('Owned package-manager metadata lost its pinned version')
    const actual = await run(
      'pnpm-version',
      managerExecutable,
      [...managerPrefix, '--version'],
      cwd
    )
    if (`pnpm@${actual.stdout.trim()}` !== expectedManager)
      throw new Error(`Unexpected package manager in ${name} project`)
    const binding = {
      name,
      cwd,
      projectMetadata,
      metadataSHA256: sha(before),
      version: actual.stdout.trim(),
    }
    managerBindings.push(binding)
    await fs.writeFile(
      path.join(evidenceDir, 'package-manager-bindings.json'),
      JSON.stringify(managerBindings, null, 2)
    )
    const result = await run(
      name,
      managerExecutable,
      [...managerPrefix, ...args],
      cwd
    )
    if (sha(await fs.readFile(projectMetadata)) !== binding.metadataSHA256)
      throw new Error(
        'Owned package-manager metadata changed during the command'
      )
    return result
  }
  const nextRequire = createRequire(path.join(packageDir, 'package.json'))
  const packed = new Map()
  const packageInputs = []
  const tarballs = path.join(evidenceDir, 'tarballs')
  await fs.mkdir(tarballs)
  const packingWorkspace = path.join(evidenceDir, 'pack-workspace')
  await fs.mkdir(packingWorkspace)
  await fs.writeFile(
    path.join(packingWorkspace, 'package.json'),
    JSON.stringify({ private: true, packageManager: expectedManager })
  )
  await fs.writeFile(
    path.join(packingWorkspace, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n"
  )
  async function pack(directory) {
    directory = await fs.realpath(directory)
    const bytes = await fs.readFile(path.join(directory, 'package.json'))
    const metadata = JSON.parse(bytes)
    if (packed.has(metadata.name)) return
    const target = path.join(
      tarballs,
      `${metadata.name.replaceAll('/', '-')}.tgz`
    )
    packed.set(metadata.name, target)
    packageInputs.push({
      name: metadata.name,
      version: metadata.version,
      packageJson: path.join(directory, 'package.json'),
      sha256: sha(bytes),
    })
    const requireFromPackage = createRequire(
      path.join(directory, 'package.json')
    )
    for (const name of Object.keys(metadata.dependencies ?? {})) {
      let dependencyDirectory
      try {
        dependencyDirectory = path.dirname(
          requireFromPackage.resolve(`${name}/package.json`)
        )
      } catch (error) {
        if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
        // A package may hide package.json while exposing its ordinary entry.
        // Resolve without evaluating the entry, then locate that package's manifest.
        let directory = path.dirname(requireFromPackage.resolve(name))
        while (true) {
          const manifest = path.join(directory, 'package.json')
          try {
            if (JSON.parse(await fs.readFile(manifest, 'utf8')).name === name) {
              dependencyDirectory = directory
              break
            }
          } catch (cause) {
            if (cause.code !== 'ENOENT') throw cause
          }
          const parent = path.dirname(directory)
          if (parent === directory)
            throw new Error(`Missing manifest for ${name}`)
          directory = parent
        }
      }
      await pack(dependencyDirectory)
    }
    // Pack only owned regular copies; no command runs in an installed dependency.
    const packingDirectory = path.join(
      packingWorkspace,
      'packages',
      metadata.name.replaceAll('/', '-')
    )
    await fs.cp(directory, packingDirectory, {
      recursive: true,
      dereference: true,
      filter: (filename) =>
        !filename.startsWith(path.join(directory, 'node_modules') + path.sep) &&
        filename !== path.join(directory, 'node_modules'),
    })
    // pnpm rewrites workspace ranges from the installed workspace dependency.
    // These links are confined to the packing workspace, never the consumer.
    const workspaceRanges = {
      ...metadata.dependencies,
      ...metadata.devDependencies,
      ...metadata.peerDependencies,
      ...metadata.optionalDependencies,
    }
    for (const [name, range] of Object.entries(workspaceRanges)) {
      if (!range.startsWith('workspace:')) continue
      const target = path.join(
        packingWorkspace,
        'packages',
        name.replaceAll('/', '-')
      )
      // pack also resolves workspace devDependency versions. Copy their real
      // manifests for that metadata-only rewrite; they are not consumer deps.
      await fs.mkdir(target, { recursive: true })
      const manifest = requireFromPackage.resolve(`${name}/package.json`)
      const original = await fs.readFile(manifest)
      await fs.writeFile(path.join(target, 'package.json'), original)
      packageInputs.push({
        name,
        packageJson: manifest,
        sha256: sha(original),
        packingMetadataOnly: true,
      })
      const link = path.join(packingDirectory, 'node_modules', name)
      await fs.mkdir(path.dirname(link), { recursive: true })
      await fs.symlink(target, link, 'junction')
    }
    // Dispatch from our pinned workspace, not a dependency's own manager field.
    // --dir still makes pnpm pack the original copied package manifest.
    await runPinnedManager(
      'pack',
      [
        '--dir',
        packingDirectory,
        '--config.ignore-scripts=true',
        'pack',
        '--out',
        target,
      ],
      packingWorkspace,
      path.join(packingWorkspace, 'package.json')
    )
    await fs.writeFile(`${target}.sha256`, sha(await fs.readFile(target)))
  }
  await pack(packageDir)
  await pack(path.dirname(nextRequire.resolve('typescript/package.json')))
  await pack(path.dirname(nextRequire.resolve('@types/node/package.json')))

  const local = path.join(evidenceDir, 'local-packages')
  for (const [name, declaration] of [
    [
      'next-test-type-helper',
      await fs.readFile(path.join(inputDir, 'helper.d.ts.txt'), 'utf8'),
    ],
    ['ordinary-application', "export declare const mode: 'application'\n"],
    ...(matcherResultTypes
      ? [
          [
            'next-matcher-type-helper',
            await fs.readFile(
              path.join(inputDir, 'matcher-helper.d.ts.txt'),
              'utf8'
            ),
          ],
        ]
      : []),
  ]) {
    const directory = path.join(local, name)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', types: 'index.d.ts' })
    )
    await fs.writeFile(path.join(directory, 'index.d.ts'), declaration)
    await fs.writeFile(
      path.join(directory, 'index.js'),
      "throw new Error('Type-only fixture was evaluated')\n"
    )
    await pack(directory)
  }

  const consumer = path.join(evidenceDir, 'consumer')
  await fs.mkdir(consumer)
  const dependencies = Object.fromEntries(
    [...packed].map(([name, tarball]) => [name, `file:${tarball}`])
  )
  await fs.writeFile(
    path.join(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'next-editor-type-consumer',
        private: true,
        packageManager: expectedManager,
        type: 'module',
        dependencies,
        pnpm: { overrides: dependencies },
      },
      null,
      2
    )
  )
  await fs.writeFile(
    path.join(consumer, '.npmrc'),
    'auto-install-peers=false\nstrict-peer-dependencies=false\n'
  )
  await runPinnedManager(
    'install',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-optional',
      '--store-dir',
      path.join(evidenceDir, 'store'),
    ],
    consumer,
    path.join(consumer, 'package.json')
  )
  const consumerRequire = createRequire(path.join(consumer, 'package.json'))
  for (const name of ['vitest', 'vite']) {
    try {
      consumerRequire.resolve(name)
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') continue
      throw error
    }
    throw new Error(`The Next-only consumer unexpectedly installed ${name}`)
  }
  const packagePath = await fs.realpath(
    path.dirname(consumerRequire.resolve('next/package.json'))
  )
  if (!packagePath.startsWith(consumer + path.sep))
    throw new Error('Next was not installed inside the new consumer')
  const typescript = consumerRequire.resolve('typescript/lib/tsc.js')
  const originalCompilerRoot = path.dirname(
    nextRequire.resolve('typescript/package.json')
  )
  const installedCompilerRoot = path.dirname(
    consumerRequire.resolve('typescript/package.json')
  )
  const tar = nextRequire('next/dist/compiled/tar')
  const packedCompilerManifestParts = []
  let packedCompilerManifests = 0
  await tar.t({
    file: packed.get('typescript'),
    onentry(entry) {
      if (entry.path !== 'package/package.json') return
      packedCompilerManifests++
      entry.on('data', (bytes) => packedCompilerManifestParts.push(bytes))
    },
  })
  if (packedCompilerManifests !== 1)
    throw new Error('Missing unique packed TypeScript manifest')
  const packedCompilerManifest = Buffer.concat(packedCompilerManifestParts)
  const installedCompilerManifest = await fs.readFile(
    path.join(installedCompilerRoot, 'package.json')
  )
  const sourceCompilerMetadata = JSON.parse(
    await fs.readFile(path.join(originalCompilerRoot, 'package.json'), 'utf8')
  )
  const installedCompilerMetadata = JSON.parse(installedCompilerManifest)
  if (
    sha(packedCompilerManifest) !== sha(installedCompilerManifest) ||
    installedCompilerMetadata.version !== sourceCompilerMetadata.version
  )
    throw new Error(
      'Installed TypeScript metadata differs from its packed source'
    )
  const compilerBindings = [
    {
      relative: 'package.json',
      original: sha(
        await fs.readFile(path.join(originalCompilerRoot, 'package.json'))
      ),
      packed: sha(packedCompilerManifest),
      installed: sha(installedCompilerManifest),
      version: installedCompilerMetadata.version,
    },
  ]
  for (const relative of ['lib/tsc.js', 'lib/_tsc.js']) {
    const original = sha(
      await fs.readFile(path.join(originalCompilerRoot, relative))
    )
    const installed = sha(
      await fs.readFile(path.join(installedCompilerRoot, relative))
    )
    compilerBindings.push({ relative, original, installed })
    if (original !== installed)
      throw new Error(
        'Installed TypeScript compiler differs from the selected source'
      )
  }
  await fs.writeFile(
    path.join(evidenceDir, 'compiler-bindings.json'),
    JSON.stringify(compilerBindings, null, 2)
  )
  const declarationBindings = []
  for (const relative of [
    'experimental/testing/vitest.d.ts',
    'experimental/testing/vitest-global.d.ts',
    'experimental/testing/vitest-globals.d.ts',
    'experimental/testing/vitest-import-meta.d.ts',
    'dist/experimental/testing/vitest.d.ts',
    'dist/experimental/testing/config-api.d.ts',
    'dist/compiled/next-test-primitives/index.d.ts',
  ]) {
    const original = sha(await fs.readFile(path.join(packageDir, relative)))
    const installed = sha(await fs.readFile(path.join(packagePath, relative)))
    declarationBindings.push({ relative, original, installed })
    if (original !== installed)
      throw new Error(`Installed declaration changed: ${relative}`)
  }
  await fs.writeFile(
    path.join(evidenceDir, 'declaration-bindings-before.json'),
    JSON.stringify(declarationBindings, null, 2)
  )
  const sourceHashes = {}
  for (const name of [
    'bare',
    'config',
    'globals',
    'import-meta',
    'ordinary',
    'without-optin',
    'unsupported-subpath',
    ...(matcherResultTypes ? ['matcher-results'] : []),
  ]) {
    const bytes = await fs.readFile(path.join(inputDir, `${name}.ts.txt`))
    sourceHashes[name] = sha(bytes)
    await fs.writeFile(path.join(consumer, `${name}.ts`), bytes)
  }
  const common = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'Bundler',
  }
  const selections = [
    ['bare', ['node', 'next/experimental/testing/vitest-global'], 0],
    ['config', ['node', 'next/experimental/testing/vitest-global'], 0],
    ['globals', ['node', 'next/experimental/testing/vitest-globals'], 0],
    [
      'import-meta',
      ['node', 'next/experimental/testing/vitest-import-meta'],
      0,
    ],
    ['ordinary', ['node'], 0],
    ['without-optin', ['node'], 2],
    [
      'unsupported-subpath',
      ['node', 'next/experimental/testing/vitest-global'],
      2,
    ],
    ['upstream-type-reference', ['node', 'vitest/globals'], 2],
    ...(matcherResultTypes
      ? [
          [
            'matcher-results',
            ['node', 'next/experimental/testing/vitest-global'],
            0,
          ],
        ]
      : []),
  ]
  const programs = []
  const consumedDeclarations = []
  for (const [name, types, expected] of selections) {
    const config = path.join(consumer, `${name}.json`)
    await fs.writeFile(
      config,
      JSON.stringify(
        {
          compilerOptions: { ...common, types },
          files: [
            `${name === 'upstream-type-reference' ? 'ordinary' : name}.ts`,
          ],
        },
        null,
        2
      )
    )
    const result = await run(
      name,
      process.execPath,
      [
        typescript,
        '--project',
        config,
        '--pretty',
        'false',
        '--traceResolution',
        '--listFiles',
      ],
      consumer,
      expected
    )
    if (
      (name === 'without-optin' || name === 'unsupported-subpath') &&
      !result.stdout.includes('error TS2307: Cannot find module')
    )
      throw new Error(
        'The no-opt-in control did not retain its missing bare-module diagnostic'
      )
    if (
      name === 'upstream-type-reference' &&
      !result.stdout.includes('error TS2688: Cannot find type definition file')
    )
      throw new Error(
        'An uninstalled upstream type-reference namespace unexpectedly resolved'
      )
    const consumed = []
    for (const filename of result.stdout.split(/\r?\n/)) {
      if (!path.isAbsolute(filename) || !filename.endsWith('.d.ts')) continue
      const canonical = await fs.realpath(filename)
      if (canonical.startsWith(packagePath + path.sep))
        consumed.push(canonical.slice(packagePath.length + 1))
    }
    const hasBridge = consumed.includes(
      'experimental/testing/vitest-global.d.ts'
    )
    if (
      [
        'bare',
        'config',
        'globals',
        'import-meta',
        'unsupported-subpath',
        ...(matcherResultTypes ? ['matcher-results'] : []),
      ].includes(name) !== hasBridge
    )
      throw new Error(`Unexpected declaration opt-in scope: ${name}`)
    if (
      name === 'config' &&
      !consumed.includes('dist/experimental/testing/config-api.d.ts')
    )
      throw new Error(
        'The config import did not consume the matching Next declaration'
      )
    if (
      name === 'bare' &&
      !consumed.includes('dist/compiled/next-test-primitives/index.d.ts')
    )
      throw new Error(
        'The mock helper did not consume the matching Next primitive declarations'
      )
    consumedDeclarations.push({
      name,
      nextDeclarations: [...new Set(consumed)].sort(),
    })
    programs.push({ name, types, actualExitCode: result.owner.exitCode })
  }
  for (const binding of declarationBindings) {
    if (
      sha(await fs.readFile(path.join(packagePath, binding.relative))) !==
      binding.installed
    )
      throw new Error(`Installed declaration mutated: ${binding.relative}`)
  }
  await fs.writeFile(
    path.join(evidenceDir, 'consumed-declarations.json'),
    JSON.stringify(consumedDeclarations, null, 2)
  )
  const result = {
    programs,
    installedNextPath: packagePath,
    declarationBindings,
    noVitestOrVitePackage: true,
    sourceHashes,
    packageInputs,
    managerBindings,
    compilerBindings,
    testFacadeOrControllerEvaluated: false,
    customPathsMapping: false,
    complete: true,
    matcherResultTypes,
  }
  await fs.writeFile(
    path.join(evidenceDir, 'actual-summary.json'),
    JSON.stringify(result, null, 2)
  )
  return result
}

module.exports = { checkEditorTypes }

if (require.main === module) {
  const options = JSON.parse(process.argv[2])
  checkEditorTypes(options).catch(async (error) => {
    await fs.writeFile(
      path.join(options.evidenceDir, 'failure.json'),
      JSON.stringify(
        { name: error.name, message: error.message, stack: error.stack },
        null,
        2
      )
    )
    console.error(error)
    process.exitCode = 1
  })
}
