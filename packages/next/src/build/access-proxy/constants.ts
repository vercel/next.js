export const WRITES: Array<string> = [
  'chmod',
  'chown',
  'fchmod',
  'fchown',
  'fdatasync',
  'fsync',
  'ftruncate',
  'futimes',
  'lchown',
  'lutimes',
  'mkdtemp',
  'mkdir',
  'rmdir',
  'unlink',
  'utimes',
  'writeBuffer',
  'writeBuffers',
  'writeString',
]

export const READS: Array<string> = [
  'copyFile',
  'internalModuleReadJSON',
  'link',
  'open',
  'openFileHandle',
  'readlink',
  'readdir',
  'realpath',
  'rename',
]

export const CHECKS: Array<string> = [
  'lstat',
  'stat',
  'access',
  'internalModuleStat',
]
