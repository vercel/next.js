// the script must be run with tsx

import fs from 'fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'

import { NEXT_DIR, exec, execFn, packageFiles } from './pack-util.js'

interface Options {
  project: string
  build: boolean
  noBuild: boolean
  nativeBuild: boolean
  noNativeBuild: boolean
  verbose: number
  _: string[]
}

// --- Parse command line arguments ---
const argv = yargs(hideBin(process.argv))
  .scriptName('patch-next')
  .command(
    'patch-next',
    'Patch Local Next.js packages to the target project directory'
  )
  .usage('$0 <project> [..options]', '', (yargs: any) => {
    yargs.positional('project', {
      type: 'string',
      describe: ': Target directory of the Next.js Project to patch',
    })
  })
  .example(
    '$0 ../my-app --no-build',
    'Patch Next.js packages in the "my-next-project" directory'
  )
  .demandCommand(1, 'A project directory is required.')
  .option('build', {
    type: 'boolean',
    default: true,
    description: 'Skip the Next.js build step (`pnpm i` and `pnpm build`).',
  })
  .option('native-build', {
    type: 'boolean',
    default: true,
    description: 'Skip the native modules build step.',
  })
  .option('verbose', {
    type: 'number',
    choices: [0, 1, 2],
    alias: 'V',
    description: 'Set the verbosity level (0: WARN, 1: INFO, 2: DEBUG)',
  })
  .help()
  .alias('help', 'h')
  .alias('version', 'v')
  .strictCommands()
  .parse()

const { project: projectDir, build, nativeBuild } = argv as Options

const VERBOSE_LEVEL = argv.verbose ?? -1

function WARN(...args: any[]) {
  VERBOSE_LEVEL >= 0 && console.warn(...args)
}
function INFO(...args: any[]) {
  VERBOSE_LEVEL >= 1 && console.info(...args)
}
function DEBUG(...args: any[]) {
  VERBOSE_LEVEL >= 2 && console.log(...args)
}

const PROJECT_DIR = path.resolve(projectDir)
const NEXT_PACKAGES = path.join(NEXT_DIR, 'packages')

function realPathIfAny(path: string): string | null {
  try {
    return fs.realpathSync(path)
  } catch {
    return null
  }
}

async function copy(src: string, dst: string): Promise<void> {
  const realDst = realPathIfAny(dst)

  if (!realDst) {
    WARN(`[x] Destination path ${dst} does not exist. Skipping copy.`)
    return
  }

  if (realDst && realDst === src) {
    WARN(
      `[x] Source and destination paths are the same: ${src}. Skipping copy.`
    )
    return
  }

  if (!fs.existsSync(src)) {
    WARN(`[x] Source path ${src} does not exist. Skipping copy.`)
    return
  }

  const files = await packageFiles(src)
  DEBUG(`[x] Found ${files.length} files to copy from ${src}`)

  for (const file of files) {
    const srcFile = path.join(src, file)
    const dstFile = path.join(realDst, file)

    DEBUG(`Copying ${srcFile} to ${dstFile}`)
    fs.cpSync(srcFile, dstFile, {
      recursive: true,
    })
  }
}

// --- Main execution ---
async function main(): Promise<void> {
  if (!fs.existsSync(PROJECT_DIR)) {
    console.error(`Error: Project directory "${PROJECT_DIR}" does not exist.`)
    process.exit(1)
  }

  INFO(`[x] Project Directory: ${PROJECT_DIR}`)
  INFO(`[x] Next.js Source: ${NEXT_PACKAGES}`)

  if (build) {
    exec('Install Next.js build dependencies', 'pnpm i')
    exec('Build Next.js', 'pnpm run build')
  }

  if (nativeBuild) {
    const originalArgs = process.argv.slice(2)
    const nativeBuildArgs = originalArgs.filter((arg) => arg !== projectDir)
    process.argv = [process.argv[0], process.argv[1], ...nativeBuildArgs]
    INFO('Building native modules...')
    await import('./build-native.js')
  }

  const packagesToPatch = [
    { name: 'next', path: 'next' },
    { name: '@next/swc', path: 'next-swc' },
    { name: '@next/mdx', path: 'next-mdx' },
    { name: '@next/bundle-analyzer', path: 'next-bundle-analyzer' },
  ]

  INFO(
    `[x] Patching packages: ${packagesToPatch.map((pkg) => pkg.name).join(', ')}`
  )
  for (const pkg of packagesToPatch) {
    await execFn(`Patching ${pkg.name}`, () =>
      copy(
        path.join(NEXT_PACKAGES, pkg.path),
        path.join(PROJECT_DIR, 'node_modules', pkg.name)
      )
    )
  }

  console.log(`\n\x1b[1;4mPatching complete!\x1b[0m\n`)
}

main().catch((e) => {
  console.error('An unexpected error occurred:')
  console.error(e)
  process.exit(1)
})
