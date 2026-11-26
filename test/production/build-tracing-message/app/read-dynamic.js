import fs from 'fs'
import path from 'path'

// Dynamic fs access: result of path.join flows into fs.readFileSync.
// This SHOULD still warn (with fs.readFileSync as origin, not path.join).
export default function (f) {
  return fs.readFileSync(path.join(process.cwd(), f), 'utf8')
}
