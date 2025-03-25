// This script must be run with tsx

const {
  NEXT_DIR,
  exec,
  execAsyncWithOutput,
  glob,
  packageFiles,
} = require('./pack-util.cjs')
const fs = require('node:fs/promises')
const patchPackageJson = require('./pack-utils/patch-package-json.ts').default
const yargs = require('yargs')
const buildNative = require('./build-native.cjs')

const TARBALLS = `${NEXT_DIR}/tarballs`
const NEXT_PACKAGES = `${NEXT_DIR}/packages`
const NEXT_TARBALL = `${TARBALLS}/next.tar`
const NEXT_SWC_TARBALL = `${TARBALLS}/next-swc.tar`
const NEXT_MDX_TARBALL = `${TARBALLS}/next-mdx.tar`
const NEXT_ENV_TARBALL = `${TARBALLS}/next-env.tar`
const NEXT_BA_TARBALL = `${TARBALLS}/next-bundle-analyzer.tar`

// the debuginfo on macos is much smaller, so we don't typically need to strip
const DEFAULT_PACK_NEXT_COMPRESS =
  process.platform === 'darwin' ? 'none' : 'strip'
const PACK_NEXT_COMPRESS =
  process.env.PACK_NEXT_COMPRESS || DEFAULT_PACK_NEXT_COMPRESS

const cliOptions = yargs(process.argv.slice(2))
  .option('no-js-build', {
    type: 'boolean',
    describe: 'Skip building JavaScript code',
  })
  .option('project', {
    alias: 'p',
    type: 'string',
  })
  .option('tar', {
    type: 'boolean',
    describe: 'Create tarballs instead of direct reflinks',
  }).argv

async function main() {
  if (!cliOptions.noJsBuild) {
    exec('Install Next.js build dependencies', 'pnpm i')
    exec('Build Next.js', 'pnpm run build')
  }

  if (PACK_NEXT_COMPRESS !== 'strip') {
    // HACK: delete any pre-existing binaries to force napi-rs to rewrite it
    let binaries = await nextSwcBinaries()
    await Promise.all(binaries.map((bin) => fs.rm(bin)))
  }

  await buildNative(cliOptions._)

  if (cliOptions.tar) {
    await fs.mkdir(TARBALLS, { recursive: true })

    // build all tarfiles in parallel
    await Promise.all([
      packNextSwc(),
      ...[
        [`${NEXT_PACKAGES}/next`, NEXT_TARBALL],
        [`${NEXT_PACKAGES}/next-mdx`, NEXT_MDX_TARBALL],
        [`${NEXT_PACKAGES}/next-env`, NEXT_ENV_TARBALL],
        [`${NEXT_PACKAGES}/next-bundle-analyzer`, NEXT_BA_TARBALL],
      ].map(([packagePath, tarballPath]) =>
        packWithTar(packagePath, tarballPath)
      ),
    ])
  }

  const packageFiles = getPackageFiles(cliOptions.tar)

  if (cliOptions.project != null) {
    const patchedPath = await patchPackageJson(cliOptions.project, {
      nextTarball: packageFiles.nextFile,
      nextMdxTarball: packageFiles.nextMdxFile,
      nextEnvTarball: packageFiles.nextEnvFile,
      nextBundleAnalyzerTarball: packageFiles.nextBaFile,
      nextSwcTarball: packageFiles.nextSwcFile,
    })
    console.log(`Patched ${patchedPath}`)
  } else {
    console.log('Add the following overrides to your workspace package.json:')
    console.log(`  "pnpm": {`)
    console.log(`    "overrides": {`)
    console.log(
      `      "next": ${JSON.stringify(`file:${packageFiles.nextFile}`)},`
    )
    console.log(
      `      "@next/mdx": ${JSON.stringify(`file:${packageFiles.nextMdxFile}`)},`
    )
    console.log(
      `      "@next/env": ${JSON.stringify(`file:${packageFiles.nextEnvFile}`)},`
    )
    console.log(
      `      "@next/bundle-analyzer": ${JSON.stringify(`file:${packageFiles.nextBaFile}`)}`
    )
    console.log(`    }`)
    console.log(`  }`)
    console.log()
    console.log(
      'Add the following dependencies to your workspace package.json:'
    )
    console.log(`  "dependencies": {`)
    console.log(
      `    "@next/swc": ${JSON.stringify(`file:${packageFiles.nextSwcFile}`)},`
    )
    console.log(`    ...`)
    console.log(`  }`)
    console.log()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

async function nextSwcBinaries() {
  return await glob('next-swc/native/*.node', {
    cwd: NEXT_PACKAGES,
    absolute: true,
  })
}

// We use neither:
// * npm pack, as it doesn't include native modules in the tarball
// * pnpm pack, as it tries to include target directories and compress them,
//   which takes forever.
// Instead, we generate non-compressed tarballs.
async function packWithTar(packagePath, tarballPath, extraArgs = []) {
  const paths = await packageFiles(packagePath)

  const command = [
    'tar',
    '-c',
    // https://apple.stackexchange.com/a/444073
    ...(process.platform === 'darwin' ? ['--no-mac-metadata'] : []),
    '-f',
    tarballPath,
    ...extraArgs,
    '--',
    ...paths.map((p) => `./${p}`),
  ]

  await execAsyncWithOutput(`Pack ${packagePath}`, command, {
    cwd: packagePath,
  })
}

// Special-case logic for packing next-swc.
//
// pnpm emits `ERR_FS_FILE_TOO_LARGE` if the tarfile is >2GiB due to limits
// in libuv (https://github.com/libuv/libuv/pull/1501). This is common with
// next-swc due to the large amount of debugging symbols. We can fix this one
// of two ways: strip or compression.
//
// We default to stripping (usually faster), but on Linux, we can compress
// instead with objcopy, keeping debug symbols intact. This is controlled by
// `PACK_NEXT_COMPRESS`.
async function packNextSwc() {
  const packagePath = `${NEXT_PACKAGES}/next-swc`
  switch (PACK_NEXT_COMPRESS) {
    case 'strip':
      await execAsyncWithOutput('Stripping next-swc native binary', [
        'strip',
        ...(process.platform === 'darwin' ? ['-x', '-'] : ['--']),
        await nextSwcBinaries(),
      ])
      await packWithTar(packagePath, NEXT_SWC_TARBALL)
      break
    case 'objcopy-zstd':
    case 'objcopy-zlib':
      if (process.platform !== 'linux') {
        throw new Error('objcopy-{zstd,zlib} is only supported on Linux')
      }
      const format = PACK_NEXT_COMPRESS === 'objcopy-zstd' ? 'zstd' : 'zlib'
      await Promise.all(
        (await nextSwcBinaries()).map((bin) =>
          execAsyncWithOutput(
            'Compressing debug symbols in next-swc native binary',
            ['objcopy', `--compress-debug-sections=${format}`, '--', bin]
          )
        )
      )
      await packWithTar(packagePath, NEXT_SWC_TARBALL)
      break
    case 'none':
      await packWithTar(packagePath, NEXT_SWC_TARBALL)
      break
    default:
      throw new Error(
        "PACK_NEXT_COMPRESS must be one of 'strip', 'objcopy-zstd', " +
          "'objcopy-zlib', or 'none'"
      )
  }
}

function getPackageFiles(shouldCreateTarballs) {
  if (shouldCreateTarballs) {
    return {
      nextFile: NEXT_TARBALL,
      nextMdxFile: NEXT_MDX_TARBALL,
      nextEnvFile: NEXT_ENV_TARBALL,
      nextBaFile: NEXT_BA_TARBALL,
      nextSwcFile: NEXT_SWC_TARBALL,
    }
  }

  return {
    nextFile: `${NEXT_PACKAGES}/next`,
    nextMdxFile: `${NEXT_PACKAGES}/next-mdx`,
    nextEnvFile: `${NEXT_PACKAGES}/next-env`,
    nextBaFile: `${NEXT_PACKAGES}/next-bundle-analyzer`,
    nextSwcFile: `${NEXT_PACKAGES}/next-swc`,
  }
}
