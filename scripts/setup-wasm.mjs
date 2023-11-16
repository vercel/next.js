import path from 'path'
import fs from 'fs'
;(async function () {
  try {
    let wasmDir = path.join(process.cwd(), 'packages/next-swc/crates/wasm')
    let wasmTarget = 'nodejs'

    // CI restores artifact at pkg-${wasmTarget}
    // This only runs locally
    let folderName = fs.existsSync(path.join(wasmDir, 'pkg'))
      ? 'pkg'
      : `pkg-${wasmTarget}`

    let wasmPkg = JSON.parse(
      fs.readFileSync(path.join(wasmDir, `${folderName}/package.json`))
    )
    wasmPkg.name = `@next/swc-wasm-${wasmTarget}`

    fs.writeFileSync(
      path.join(wasmDir, `${folderName}/package.json`),
      JSON.stringify(wasmPkg, null, 2)
    )

    fs.cpSync(
      path.join(wasmDir, folderName),
      path.join(process.cwd(), `node_modules/@next/swc-wasm-${wasmTarget}`),
      { force: true, recursive: true }
    )
  } catch (e) {
    console.error(e)
  }
})()
