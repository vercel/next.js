#!/usr/bin/env node

const {
  NEXT_DIR,
  exec,
  execFn,
  booleanArg,
  packageFiles,
} = require('./pack-util.cjs')
const fs = require('fs')
const path = require('path')

/** @type {string[]} */
const argv = process.argv
const args = argv.slice(2)

const NEXT_PACKAGES = `${NEXT_DIR}/packages`

const noBuild = booleanArg(args, '--no-build')
const noNativeBuild = booleanArg(args, '--no-native-build')

const PROJECT_DIR = path.resolve(args[0])

function realPathIfAny(path) {
  try {
    return fs.realpathSync(path)
  } catch {
    return null
  }
}

async function copy(src, dst) {
  const realDst = realPathIfAny(dst)
  if (!realDst) {
    return
  }

  const files = await packageFiles(src)

  for (const file of files) {
    fs.cpSync(path.join(src, file), path.join(realDst, file), {
      recursive: true,
    })
  }
}

async function main() {
  if (!noBuild) {
    exec('Install Next.js build dependencies', 'pnpm i')
    exec('Build Next.js', 'pnpm run build')
  }

  if (!noNativeBuild) {
    process.argv = [...process.argv.slice(0, 2), ...args.slice(1)]

    await require('./build-native.cjs')
  }

  await execFn('Patching next', () =>
    copy(`${NEXT_PACKAGES}/next`, `${PROJECT_DIR}/node_modules/next`)
  )
  await execFn('Patching @next/swc', () =>
    copy(`${NEXT_PACKAGES}/next-swc`, `${PROJECT_DIR}/node_modules/@next/swc`)
  )
  await execFn('Patching @next/mdx', () =>
    copy(`${NEXT_PACKAGES}/next-mdx`, `${PROJECT_DIR}/node_modules/@next/mdx`)
  )
  await execFn('Patching @next/bundle-analyzer', () =>
    copy(
      `${NEXT_PACKAGES}/next-bundle-analyzer`,
      `${PROJECT_DIR}/node_modules/@next/bundle-anlyzer`
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
