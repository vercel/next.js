#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import execa from 'execa'
import { NEXT_DIR, logCommand, execFn } from './pack-util'

const nextSwcDir = path.join(NEXT_DIR, 'packages/next-swc')

export default async function buildNative(
  buildNativeArgs: string[]
): Promise<void> {
  const buildCommand = ['pnpm', 'run', 'build-native', ...buildNativeArgs]
  logCommand('Build native bindings', buildCommand)
  await execa(buildCommand[0], buildCommand.slice(1), {
    cwd: nextSwcDir,
    // Without a shell, `pnpm run build-native` returns a 0 exit code on SIGINT?
    shell: true,
    env: {
      NODE_ENV: process.env.NODE_ENV,
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

// Check if this file is being run directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).toString()) {
  buildNative(process.argv.slice(2)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
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
