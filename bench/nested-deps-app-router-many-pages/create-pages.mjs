import * as fs from 'fs'
import * as path from 'path'

// get dirname from import.meta.url
const dirname = path.dirname(new URL(import.meta.url).pathname)

const appDir = path.resolve(dirname, 'app')
const templateDir = path.resolve(dirname, 'template')

fs.mkdirSync(appDir, { recursive: true })

fs.copyFileSync(
  path.join(templateDir, 'root-layout.js'),
  path.join(appDir, 'layout.js')
)

for (let i = 0; i < 1000; i++) {
  const pageDir = path.join(appDir, 'page' + i)
  fs.mkdirSync(pageDir, { recursive: true })
  const files = [
    'client-components-only/page.js',
    'server-and-client-components/client-component.js',
    'server-and-client-components/page.js',
    'server-components-only/page.js',
    'layout.js',
  ]
  for (const file of files) {
    const source = path.join(templateDir, file)
    const dest = path.join(pageDir, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(source, dest)
  }
}
