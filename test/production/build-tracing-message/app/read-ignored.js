import fs from 'fs'
import path from 'path'

// `turbopackIgnore` on the first argument of the fs call silences the
// dynamic-fs tracing warning. This is the placement the warning recommends.
export function readBareArg(dynamicPath) {
  return fs.readFileSync(/* turbopackIgnore: true */ dynamicPath, 'utf8')
}

// The comment on the fs call's first argument also works when that argument
// is itself a `path.join(...)` call (issue #95125: the comment must be on the
// fs call's argument, not nested inside `path.join`).
export function readJoinedArg(folder, f) {
  return fs.readFileSync(
    /* turbopackIgnore: true */ path.join(folder, f),
    'utf8'
  )
}
