import { relative, isAbsolute } from 'path'
import { fileURLToPath } from 'url'

// Formats a file url or absolute path as relative path relative to the current working directory.
// It will start with ./ or ../ if it's a relative path.
// It might be an absolute path if it's on a different drive on windows.
// When the argument is not a file url or a absolute path, it will return the argument as is.
export function relativeToCwd(file: string): string
export function relativeToCwd(file: null): null
export function relativeToCwd(file: string | null): string | null
export function relativeToCwd(file: string | null): string | null {
  if (!file) {
    return file
  }
  if (file.startsWith('file://')) {
    file = fileURLToPath(file)
  } else if (!isAbsolute(file)) {
    return file
  }
  const relPath = relative(process.cwd(), file)
  if (isAbsolute(relPath)) {
    return relPath
  }
  if (relPath.startsWith('../')) {
    return relPath
  }
  return './' + relPath
}
