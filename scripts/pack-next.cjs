#!/usr/bin/env node

const {
  NEXT_DIR,
  booleanArg,
  exec,
  execAsyncWithOutput,
  glob,
  namedValueArg,
  packageFiles,
} = require('./pack-util.cjs')
const fs = require('fs')
const fsPromises = require('fs/promises')

const args = process.argv.slice(2)

const TARBALLS = `${NEXT_DIR}/tarballs`
const NEXT_PACKAGES = `${NEXT_DIR}/packages`
const noBuild = booleanArg(args, '--no-build')
const projectPath = namedValueArg(args, '--project')

async function main() {
  // the debuginfo on macos is much smaller, so we don't typically need to strip
  const DEFAULT_PACK_NEXT_COMPRESS =
    process.platform === 'darwin' ? 'none' : 'strip'
  const PACK_NEXT_COMPRESS =
    process.env.PACK_NEXT_COMPRESS || DEFAULT_PACK_NEXT_COMPRESS

  fs.mkdirSync(TARBALLS, { recursive: true })

  if (!noBuild) {
    exec('Install Next.js build dependencies', 'pnpm i')
    exec('Build Next.js', 'pnpm run build')
  }

  if (PACK_NEXT_COMPRESS !== 'strip') {
    // HACK: delete any pre-existing binaries to force napi-rs to rewrite it
    let binaries = await nextSwcBinaries()
    await Promise.all(binaries.map((bin) => fsPromises.rm(bin)))
  }

  await require('./build-native.cjs')

  const NEXT_TARBALL = `${TARBALLS}/next.tar`
  const NEXT_SWC_TARBALL = `${TARBALLS}/next-swc.tar`
  const NEXT_MDX_TARBALL = `${TARBALLS}/next-mdx.tar`
  const NEXT_ENV_TARBALL = `${TARBALLS}/next-env.tar`
  const NEXT_BA_TARBALL = `${TARBALLS}/next-bundle-analyzer.tar`

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
        const format = PACK_NEXT_COMPRESS == 'objcopy-zstd' ? 'zstd' : 'zlib'
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

  if (projectPath != null) {
    await execAsyncWithOutput(`Update package.json for ${projectPath}`, [
      'cargo',
      'xtask',
      'patch-package-json',
      projectPath,
      `--next-tarball=${NEXT_TARBALL}`,
      `--next-mdx-tarball=${NEXT_MDX_TARBALL}`,
      `--next-env-tarball=${NEXT_ENV_TARBALL}`,
      `--next-bundle-analyzer-tarball=${NEXT_BA_TARBALL}`,
      `--next-swc-tarball=${NEXT_SWC_TARBALL}`,
    ])
  } else {
    console.log('Add the following overrides to your workspace package.json:')
    console.log(`  "pnpm": {`)
    console.log(`    "overrides": {`)
    console.log(`      "next": ${JSON.stringify(`file:${NEXT_TARBALL}`)},`)
    console.log(
      `      "@next/mdx": ${JSON.stringify(`file:${NEXT_MDX_TARBALL}`)},`
    )
    console.log(
      `      "@next/env": ${JSON.stringify(`file:${NEXT_ENV_TARBALL}`)},`
    )
    console.log(
      `      "@next/bundle-analyzer": ${JSON.stringify(
        `file:${NEXT_BA_TARBALL}`
      )}`
    )
    console.log(`    }`)
    console.log(`  }`)
    console.log()
    console.log(
      'Add the following dependencies to your workspace package.json:'
    )
    console.log(`  "dependencies": {`)
    console.log(
      `    "@next/swc": ${JSON.stringify(`file:${NEXT_SWC_TARBALL}`)},`
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
