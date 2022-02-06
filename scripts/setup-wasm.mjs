import path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { copy } from 'fs-extra'
;(async function () {
  let wasmDir = path.join(process.cwd(), 'packages/next-swc/crates/wasm')
  let wasmTarget = 'nodejs'
  let wasmPkg = JSON.parse(
    await readFile(path.join(wasmDir, `pkg-${wasmTarget}/package.json`))
  )
  wasmPkg.name = `@next/swc-wasm-${wasmTarget}`

  await writeFile(
    path.join(wasmDir, `pkg-${wasmTarget}/package.json`),
    JSON.stringify(wasmPkg, null, 2)
  )

  await copy(
    path.join(wasmDir, `pkg-${wasmTarget}`),
    path.join(process.cwd(), `node_modules/@next/swc-wasm-${wasmTarget}`)
  )
})()
