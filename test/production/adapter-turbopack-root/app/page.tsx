import fs from 'node:fs'
import path from 'node:path'

export default function Page() {
  // Lives next to the project directory: inside `turbopack.root`, but outside
  // the repository root.
  const data = fs.readFileSync(
    path.join(process.cwd(), '../shared-data.txt'),
    'utf8'
  )
  return <p id="shared-data">{data}</p>
}
