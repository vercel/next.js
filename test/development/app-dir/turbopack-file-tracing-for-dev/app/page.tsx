import fs from 'fs'
import path from 'path'

export default function Page() {
  // A file reference that file tracing follows.
  const content = fs.readFileSync(
    path.join(process.cwd(), 'content/hello.txt'),
    'utf8'
  )
  return <p>{content.trim()}</p>
}
