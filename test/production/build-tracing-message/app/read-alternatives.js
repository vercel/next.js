import fs from 'fs'
import path from 'path'

// Each of these reads either a statically known file or a fully dynamic path.
// The dynamic alternative must be ignored (like a bare dynamic path is), while
// the known file must still be traced. Neither may trace the whole project.

export function readNullishFallback(dynamicPath) {
  return fs.readFileSync(
    dynamicPath ?? path.join(process.cwd(), 'manifest-a.json'),
    'utf8'
  )
}

export function readDefaultParam(
  manifestPath = path.join(process.cwd(), 'manifest-b.json')
) {
  return fs.readFileSync(manifestPath, 'utf8')
}

export function readBareDynamic(dynamicPath) {
  try {
    return fs.readFileSync(dynamicPath, 'utf8')
  } catch {
    return undefined
  }
}
