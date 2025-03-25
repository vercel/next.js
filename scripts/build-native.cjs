#!/usr/bin/env node

const { NEXT_DIR, logCommand, execFn } = require('./pack-util.cjs')
const fs = require('node:fs/promises')
const path = require('path')
const execa = require('execa')

const nextSwcDir = path.join(NEXT_DIR, 'packages/next-swc')

module.exports = async function buildNative(buildNativeArgs) {
  const buildCommand = ['pnpm', 'run', 'build-native', ...buildNativeArgs]
  logCommand('Build native bindings', buildCommand)
  await execa(buildCommand[0], buildCommand.slice(1), {
    cwd: nextSwcDir,
    env: {
      CARGO_TERM_COLOR: 'always',
      TTY: '1',
    },
    stdio: 'inherit',
  })

  await execFn(
    'Copy generated types to `next/src/build/swc/generated-native.d.ts`',
    () => writeTypes()
  )
}

if (require.main === module) {
  module.exports(process.argv.slice(2))
}

async function writeTypes() {
  const generatedTypesPath = path.join(
    NEXT_DIR,
    'packages/next-swc/native/index.d.ts'
  )
  const vendoredTypesPath = path.join(
    NEXT_DIR,
    'packages/next/src/build/swc/generated-native.d.ts'
  )
  const generatedTypesMarker = '// GENERATED-TYPES-BELOW\n'
  const generatedNotice =
    '// DO NOT MANUALLY EDIT THESE TYPES\n' +
    '// You can regenerate this file by running `pnpm swc-build-native` in the root of the repo.\n\n'

  const generatedTypes = await fs.readFile(generatedTypesPath, 'utf8')
  let vendoredTypes = await fs.readFile(vendoredTypesPath, 'utf8')

  vendoredTypes = vendoredTypes.split(generatedTypesMarker)[0]
  vendoredTypes =
    vendoredTypes + generatedTypesMarker + generatedNotice + generatedTypes

  await fs.writeFile(vendoredTypesPath, vendoredTypes)

  const prettifyCommand = ['prettier', '--write', vendoredTypesPath]
  logCommand('Prettify generated types', prettifyCommand)
  await execa(prettifyCommand[0], prettifyCommand.slice(1), {
    cwd: NEXT_DIR,
    stdio: 'inherit',
    preferLocal: true,
  })
}
