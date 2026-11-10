import fs from 'fs'
import path from 'path'

// Each of these reads either a statically known file or a fully dynamic path.
// The known file should be traced, but the dynamic alternative should be
// ignored (like a bare dynamic path is) instead of tracing the whole project.

export function readNullishFallback(dynamicPath) {
  return fs.readFileSync(
    dynamicPath ??
      path.join(process.cwd(), 'data', 'static-from-app-nullish.txt'),
    'utf8'
  )
}

export function readDefaultParam(
  filePath = path.join(
    process.cwd(),
    'data',
    'static-from-app-default-param.txt'
  )
) {
  return fs.readFileSync(filePath, 'utf8')
}

export function readBareDynamic(dynamicPath) {
  try {
    return fs.readFileSync(dynamicPath, 'utf8')
  } catch {
    return undefined
  }
}
