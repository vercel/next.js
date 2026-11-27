import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
// Depth of the generated trees (each module has 6 children), can be passed as
// argument: `pnpm prepare-bench 3`
const depth = Number.parseInt(process.argv[2] ?? '5')

// Each benchmark case uses its own generated tree, so measuring one case can't
// warm up (load or evaluate) the modules of another case.
const trees = [
  // `require()`d by lib/commonjs.js
  { dir: 'commonjs', type: 'commonjs' },
  // `require()`d by lib/esm.js
  { dir: 'esm', type: 'esm' },
  // Every module uses `import defer` for its children: measures the overhead
  // of deferred imports when everything is evaluated. `require()`d by
  // lib/esm-defer-tree.js
  { dir: 'esm-defer', type: 'esm-defer' },
  // Eagerly imported at the top of lib/esm-eager.js
  { dir: 'esm-eager', type: 'esm' },
  // Imported with `import defer` at the top of lib/esm-deferred.js
  { dir: 'esm-deferred', type: 'esm' },
  // Imported with `import defer` at the top of lib/esm-deferred-unused.js,
  // but never accessed
  { dir: 'esm-deferred-unused', type: 'esm' },
]

async function main() {
  for (const { dir, type } of trees) {
    const treeDir = path.join(rootDir, dir)
    await fs.rm(treeDir, { recursive: true, force: true })
    await fs.mkdir(treeDir, { recursive: true })
    await createFiles(treeDir, 'index', depth, type)
  }

  async function createFiles(dir, prefix, depth, type) {
    const fileName = `${prefix}.js`

    let content
    if (depth === 0) {
      switch (type) {
        case 'commonjs':
          content = `module.exports = 1;`
          break
        case 'esm':
        case 'esm-defer':
          content = `export default 1;`
          break
        default:
          throw new Error(`Unknown type: ${type}`)
      }
    } else {
      const inner = []
      content = ''
      for (let i = 0; i < 6; i++) {
        const subPrefix = `${prefix}_${i}`
        await createFiles(dir, subPrefix, depth - 1, type)

        const subFileName = `${subPrefix}.js`
        switch (type) {
          case 'commonjs':
            content += `const ${subPrefix} = require('./${subFileName}');\n`
            inner.push(subPrefix)
            break
          case 'esm':
            content += `import ${subPrefix} from './${subFileName}';\n`
            inner.push(subPrefix)
            break
          case 'esm-defer':
            content += `import defer * as ${subPrefix} from './${subFileName}';\n`
            inner.push(`${subPrefix}.default`)
            break
          default:
            throw new Error(`Unknown type: ${type}`)
        }
      }
      switch (type) {
        case 'commonjs':
          content += `\nmodule.exports = 1 + ${inner.join(' + ')};`
          break
        case 'esm':
        case 'esm-defer':
          content += `\nexport default 1 + ${inner.join(' + ')};`
          break
        default:
          throw new Error(`Unknown type: ${type}`)
      }
    }

    const filePath = path.join(dir, fileName)
    await fs.writeFile(filePath, content, 'utf8')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
