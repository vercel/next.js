export function normalizeNodeModuleFilePath(filePath: string): string {
  const separatorRegex = /[\\/]/

  const separator = filePath.match(separatorRegex)
    ? filePath.match(separatorRegex)![0]
    : '/'

  // Webpack source frame could contain javascript/ prefix
  if (/javascript[\\/]/.test(filePath)) {
    filePath = filePath.replace(/javascript[\\/]/, '')
  }

  // Replace yarn's prefix, handling optional node_modules at the beginning
  // e.g. node_modules/.yarn/foo/node_modules/bar -> node_modules/bar
  filePath = filePath.replace(
    /(?:node_modules[\\/])?(?:\.yarn\/[^/]+[\\/])+node_modules[\\/]([^/]+)/,
    `node_modules${separator}$1`
  )

  // Replace pnpm's prefix, handling nested .pnpm directories
  // e.g. node_modules/.pnpm/foo/node_modules/bar -> node_modules/bar
  filePath = filePath.replace(
    /node_modules[\\/](?:\.pnpm\/[^/]+\/node_modules\/)?(?:\.pnpm[\\/][^/]+\/)?([^/]+)/,
    `node_modules${separator}$1`
  )

  // Handle multiple nested node_modules, selecting the last one
  // e.g. node_modules/xxx/node_modules/yyy/node_modules/zzz -> node_modules/zzz
  filePath = filePath.replace(
    /^(.*)node_modules[\\/]([^/]+)/,
    `node_modules${separator}$2`
  )

  return filePath
}
