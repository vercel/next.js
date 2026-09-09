import fs from 'fs'
import path from 'path'

// `turbopackIgnore` on the first argument of the fs call silences the
// dynamic-fs tracing warning. This is the placement the warning recommends.
export function readBareArg(dynamicPath) {
  return fs.readFileSync(/* turbopackIgnore: true */ dynamicPath, 'utf8')
}

// The comment also works when placed on a nested `path.join(...)` argument of
// the fs call (issue #95125): ignoring the `path.join` bubbles up and silences
// the enclosing `fs.readFileSync` whole-project tracing warning too.
export function readJoinedArg(f) {
  return fs.readFileSync(
    path.join(/* turbopackIgnore: true */ process.cwd(), f),
    'utf8'
  )
}
