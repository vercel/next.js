import path from 'path'

export function normalizePath(file: string) {
  return path.sep === '\\' ? file.replace(/\\/g, '/') : file
}
