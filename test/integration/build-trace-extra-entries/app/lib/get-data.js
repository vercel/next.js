import fs from 'fs'
import path from 'path'

export function getData() {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'content/hello.json'), 'utf8')
  )
}
