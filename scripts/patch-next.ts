// the script must be run with tsx

import fs from 'fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'

import { NEXT_DIR, exec, execFn, packageFiles } from './pack-util.js'

interface Options {
  project: string
  noBuild: boolean
  noNativeBuild: boolean
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
    '$0 ../my-app',
    'Patch Next.js packages in the "my-next-project" directory'
  )
  .demandCommand(1, 'A project directory is required.')
  .option('no-build', {
    type: 'boolean',
    default: false,
    description: 'Skip the Next.js build step (`pnpm i` and `pnpm build`).',
  })
  .option('no-native-build', {
    type: 'boolean',
    default: false,
    description: 'Skip the native modules build step.',
  })
  .help()
  .alias('help', 'h')
  .alias('version', 'v')
  .count('verbose')
  .alias('verbose', 'V')
  .strictCommands()
  .parse()

const { project: projectDir, noBuild, noNativeBuild } = argv as Options

const VERBOSE_LEVEL = argv.verbose

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
    WARN(`Destination path ${dst} does not exist. Skipping copy.`)
    return
  }

  const files = await packageFiles(src)
  DEBUG(`Found ${files.length} files to copy from ${src}`)

  for (const file of files) {
    const srcFile = path.join(src, file)
    const dstFile = path.join(realDst, file)

    // Ensure the destination directory exists
    /**
     * @CASE_2 : when directory is not present, we create it
     */
    const destDir = path.dirname(dstFile)
    if (!fs.existsSync(destDir)) {
      DEBUG(`Creating directory: ${destDir}`)
      fs.mkdirSync(destDir, { recursive: true })
    }

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

  INFO(`Project Directory: ${PROJECT_DIR}`)
  INFO(`Next.js Source: ${NEXT_PACKAGES}`)

  if (!noBuild) {
    exec('Install Next.js build dependencies', 'pnpm i')
    exec('Build Next.js', 'pnpm run build')
  }

  if (!noNativeBuild) {
    process.argv = [...process.argv.slice(0, 2), ...process.argv.slice(1)]
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
    `Patching packages: ${packagesToPatch.map((pkg) => pkg.name).join(', ')}`
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
  console.error('An unexpected error occured:')
  console.error(e)
  process.exit(1)
})
