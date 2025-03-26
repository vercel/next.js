// This script must be run with tsx

const { NEXT_DIR, execAsyncWithOutput, execFn, exec } = require('./pack-util')
const fs = require('fs')
const path = require('path')

const targetDir = path.join(NEXT_DIR, 'target')
const nextSwcDir = path.join(NEXT_DIR, 'packages/next-swc')

module.exports = (async () => {
  for (let i = 0; i < 2; i++) {
    try {
      await execAsyncWithOutput(
        'Build wasm bindings',
        ['pnpm', 'run', 'build-wasm'],
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
    'Copy generated types to `next/src/build/swc/generated-wasm.d.ts`',
    () => writeTypes()
  )
})()

function writeTypes() {
  const generatedTypesPath = path.join(NEXT_DIR, 'crates/wasm/pkg/wasm.d.ts')
  const vendoredTypesPath = path.join(
    NEXT_DIR,
    'packages/next/src/build/swc/generated-wasm.d.ts'
  )

  const generatedNotice =
    '// DO NOT MANUALLY EDIT THESE TYPES\n// You can regenerate this file by running `pnpm swc-build-wasm` in the root of the repo.\n\n'

  const generatedTypes = fs.readFileSync(generatedTypesPath, 'utf8')

  const vendoredTypes = generatedNotice + generatedTypes

  fs.writeFileSync(vendoredTypesPath, vendoredTypes)

  exec('Prettify generated types', [
    'pnpm',
    'prettier',
    '--write',
    vendoredTypesPath,
  ])
}
