import fs from 'node:fs/promises'
import path from 'node:path'

const metadata = {
  'Content-Type': 'text/plain',
}

await fs.writeFile(path.join('test.txt'), metadata, 'utf-8')
