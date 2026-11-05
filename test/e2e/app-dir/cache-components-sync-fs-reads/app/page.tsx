import fs from 'node:fs'
import path from 'node:path'

export default function Page() {
  // Without an encoding, Node.js closes the file with the public `fs.closeSync`.
  const text = fs.readFileSync(path.join(process.cwd(), 'data.txt')).toString()
  return <p>{text.trim()}</p>
}
