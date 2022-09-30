import path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { copy, pathExists } from 'fs-extra'
;(async function () {
  try {
    let wasmDir = path.join(process.cwd(), 'packages/next-swc/crates/wasm')
    let wasmTarget = 'nodejs'

    // CI restores artifact at pkg-${wasmTarget}
    // This only runs locally
    let folderName = (await pathExists(path.join(wasmDir, 'pkg')))
      ? 'pkg'
      : `pkg-${wasmTarget}`

    let wasmPkg = JSON.parse(
      await readFile(path.join(wasmDir, `${folderName}/package.json`))
    )
    wasmPkg.name = `@next/swc-wasm-${wasmTarget}`

    await writeFile(
      path.join(wasmDir, `${folderName}/package.json`),
      JSON.stringify(wasmPkg, null, 2)
    )

    await copy(
      path.join(wasmDir, `${folderName}`),
      path.join(process.cwd(), `node_modules/@next/swc-wasm-${wasmTarget}`),
      { overwrite: true }
    )
  } catch (e) {
    console.error(e)
  }
})()
