// This script must be run with tsx

import fs from 'node:fs/promises'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { default as patchPackageJson } from './pack-utils/patch-package-json.js'
import buildNative from './build-native.js'

import {
  NEXT_DIR,
  exec,
  execAsyncWithOutput,
  glob,
  packageFiles,
} from './pack-util.js'

const TARBALLS = `${NEXT_DIR}/tarballs`
const NEXT_PACKAGES = `${NEXT_DIR}/packages`
const NEXT_TARBALL = `${TARBALLS}/next.tar`
const NEXT_SWC_TARBALL = `${TARBALLS}/next-swc.tar`
const NEXT_MDX_TARBALL = `${TARBALLS}/next-mdx.tar`
const NEXT_ENV_TARBALL = `${TARBALLS}/next-env.tar`
const NEXT_BA_TARBALL = `${TARBALLS}/next-bundle-analyzer.tar`

type CompressOpt = 'none' | 'strip' | 'objcopy-zlib' | 'objcopy-zstd'

interface CliOptions {
  jsBuild?: boolean
  project?: string
  tar?: boolean
  compress?: CompressOpt
  _: string[]
}

const cliOptions = yargs(hideBin(process.argv))
  .scriptName('pack-next')
  .command('$0')
  .option('js-build', {
    type: 'boolean',
    default: true,
    describe:
      'Build JavaScript code (default). Use `--no-js-build` to skip building JavaScript',
  })
  .option('project', {
    alias: 'p',
    type: 'string',
  })
  .option('tar', {
    type: 'boolean',
    describe: 'Create tarballs instead of direct reflinks',
  })
  .option('compress', {
    type: 'string',
    describe:
      'How compress the binary, useful on platforms where tarballs can ' +
      'exceed 2 GiB, which causes ERR_FS_FILE_TOO_LARGE with pnpm. Defaults ' +
      'to "strip" on Linux, otherwise defaults to "none". Requires `--tar` ' +
      'to be set.',
    choices: [
      'none',
      'strip',
      ...(process.platform === 'linux' ? ['objcopy-zlib', 'objcopy-zstd'] : []),
    ],
  })
  .check((opts: CliOptions) => {
    if (!opts.tar && (opts.compress ?? 'none') !== 'none') {
      throw new Error('--compress is only valid in combination with --tar')
    }
    return true
  })
  .middleware((opts: CliOptions) => {
    if (opts.tar && process.platform === 'linux' && opts.compress == null) {
      opts.compress = 'strip'
    }
  })
  .strict().argv as unknown as CliOptions

interface PackageFiles {
  nextFile: string
  nextMdxFile: string
  nextEnvFile: string
  nextBaFile: string
  nextSwcFile: string
}

async function main(): Promise<void> {
  if (cliOptions.jsBuild) {
    exec('Install Next.js build dependencies', 'pnpm i')
    exec('Build Next.js', 'pnpm run build')
  }

  if (cliOptions.tar && cliOptions.compress !== 'strip') {
    // HACK: delete any pre-existing binaries to force napi-rs to rewrite it
    // We must do this as pre-existing could've been stripped.
    let binaries = await nextSwcBinaries()
    await Promise.all(binaries.map((bin) => fs.rm(bin)))
  }

  await buildNative(cliOptions._)

  if (cliOptions.tar) {
    await fs.mkdir(TARBALLS, { recursive: true })

    // build all tarfiles in parallel
    await Promise.all([
      packNextSwcWithTar(cliOptions.compress ?? 'none'),
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

async function nextSwcBinaries(): Promise<string[]> {
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
async function packWithTar(
  packagePath: string,
  tarballPath: string,
  extraArgs: string[] = []
): Promise<void> {
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
async function packNextSwcWithTar(compress: CompressOpt): Promise<void> {
  const packagePath = `${NEXT_PACKAGES}/next-swc`
  switch (compress) {
    case 'strip':
      await execAsyncWithOutput('Stripping next-swc native binary', [
        'strip',
        ...(process.platform === 'darwin' ? ['-x', '-'] : ['--']),
        ...(await nextSwcBinaries()),
      ])
      await packWithTar(packagePath, NEXT_SWC_TARBALL)
      break
    case 'objcopy-zstd':
    case 'objcopy-zlib':
      // Linux-specific, feature is gated by yargs choices array
      const format = compress === 'objcopy-zstd' ? 'zstd' : 'zlib'
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
      // should never happen, yargs enforces the `choices` array
      throw new Error('compress value is invalid')
  }
}

function getPackageFiles(shouldCreateTarballs?: boolean): PackageFiles {
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
