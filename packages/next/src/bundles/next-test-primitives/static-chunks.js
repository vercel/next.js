const { readdir, readFile, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

async function rewriteChunks() {
  const directory = join(__dirname, '../../compiled/next-test-primitives')
  const chunks = (await readdir(directory))
    .filter((file) => /^\d+\.index\.js$/.test(file))
    .sort()
  const path = join(directory, 'index.js')
  const code = await readFile(path, 'utf8')
  // NCC's computed require is a directory context when rebundled by Turbopack.
  // Preserve lazy loading and the single NCC module registry, but expose only
  // the emitted JavaScript chunks to the application's compiler.
  const loader = /require\("\.\/"\+__nccwpck_require__\.u\(([$\w]+)\)\)/g
  const matches = [...code.matchAll(loader)]
  if (!chunks.length && !matches.length) return
  if (!chunks.length || matches.length !== 1) {
    throw new Error(
      'Unexpected Next test primitive chunk loader; update the static chunk rewrite'
    )
  }
  const entries = chunks
    .map(
      (file) =>
        `${Number.parseInt(file, 10)}:()=>require(${JSON.stringify(`./${file}`)})`
    )
    .join(',')
  await writeFile(
    path,
    code.replace(loader, (_, id) => `({${entries}}[${id}]())`)
  )
}

rewriteChunks().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
