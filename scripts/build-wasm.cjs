// This script must be run with tsx

const { NEXT_DIR, execAsyncWithOutput, execFn, exec } = require('./pack-util')
const fs = require('fs')
const path = require('path')

const nextSwcDir = path.join(NEXT_DIR, 'packages/next-swc')

;(async () => {
  await execAsyncWithOutput(
    'Build wasm bindings',
    ['pnpm', 'run', 'build-wasm', ...process.argv.slice(2)],
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
