#!/usr/bin/env node

const {
  NEXT_DIR,
  booleanArg,
  execAsyncWithOutput,
  execFn,
  exec,
  namedValueArg,
} = require('./pack-util.cjs')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)

// strip --no-build and --project when called from pack-next.cjs
booleanArg(args, '--no-build')
namedValueArg(args, '--project')

const targetDir = path.join(NEXT_DIR, 'target')
const nextSwcDir = path.join(NEXT_DIR, 'packages/next-swc')

module.exports = (async () => {
  for (let i = 0; i < 2; i++) {
    try {
      await execAsyncWithOutput(
        'Build native bindings',
        ['pnpm', 'run', 'build-native', ...args],
        {
          cwd: nextSwcDir,
          shell: process.platform === 'win32' ? 'powershell.exe' : false,
          env: {
            CARGO_TERM_COLOR: 'always',
            TTY: '1',
            ...process.env,
          },
        }
      )
    } catch (e) {
      if (
        e.stderr
          .toString()
          .includes('the compiler unexpectedly panicked. this is a bug.')
      ) {
        fs.rmSync(path.join(targetDir, 'release/incremental'), {
          recursive: true,
          force: true,
        })
        fs.rmSync(path.join(targetDir, 'debug/incremental'), {
          recursive: true,
          force: true,
        })
        continue
      }
      delete e.stdout
      delete e.stderr
      throw e
    }
    break
  }

  execFn(
    'Copy generated types to `next/src/build/swc/generated-native.d.ts`',
    () => writeTypes()
  )
})()

function writeTypes() {
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
    '// DO NOT MANUALLY EDIT THESE TYPES\n// You can regenerate this file by running `pnpm swc-build-native` in the root of the repo.\n\n'

  const generatedTypes = fs.readFileSync(generatedTypesPath, 'utf8')
  let vendoredTypes = fs.readFileSync(vendoredTypesPath, 'utf8')

  vendoredTypes = vendoredTypes.split(generatedTypesMarker)[0]
  vendoredTypes =
    vendoredTypes + generatedTypesMarker + generatedNotice + generatedTypes

  fs.writeFileSync(vendoredTypesPath, vendoredTypes)

  exec('Prettify generated types', [
    'pnpm',
    'prettier',
    '--write',
    vendoredTypesPath,
  ])
}
