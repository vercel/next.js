import path from 'path'

export function getStorageDirectory(distDir: string): string {
  return path.join(distDir, 'cache')
}
