import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const commonjsDir = path.join(__dirname, '../commonjs')
const esmDir = path.join(__dirname, '../esm')

async function main() {
  await fs.rm(commonjsDir, { recursive: true, force: true })
  await fs.rm(esmDir, { recursive: true, force: true })

  // Ensure directories exist
  await fs.mkdir(commonjsDir, { recursive: true })
  await fs.mkdir(esmDir, { recursive: true })

  async function createFiles(dir, prefix, depth, type) {
    const fileName = `${prefix}.js`

    let content
    if (depth === 0) {
      switch (type) {
        case 'commonjs':
          content = `module.exports = 1;`
          break
        case 'esm':
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
            break
          case 'esm':
            content += `import ${subPrefix} from './${subFileName}';\n`
            break
          default:
            throw new Error(`Unknown type: ${type}`)
        }
        inner.push(subPrefix)
      }
      switch (type) {
        case 'commonjs':
          content += `\nmodule.exports = 1 + ${inner.join(' + ')};`
          break
        case 'esm':
          content += `\nexport default 1 + ${inner.join(' + ')};`
          break
        default:
          throw new Error(`Unknown type: ${type}`)
      }
    }

    const filePath = path.join(dir, fileName)
    await fs.writeFile(filePath, content, 'utf8')
  }
  await createFiles(commonjsDir, 'index', 5, 'commonjs')
  await createFiles(esmDir, 'index', 5, 'esm')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
