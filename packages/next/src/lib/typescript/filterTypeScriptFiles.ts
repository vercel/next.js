import path from 'node:path'

export interface TypeCheckDirs {
  app?: string
  pages?: string
}

export interface DebugBuildPaths {
  app?: string[]
  pages?: string[]
}

/** Filter roots, not diagnostics: TypeScript still checks their imports. */
export function filterTypeScriptFiles(
  fileNames: string[],
  dirs: TypeCheckDirs,
  debugBuildPaths: DebugBuildPaths
): string[] {
  return fileNames.filter((fileName) => {
    for (const router of ['app', 'pages'] as const) {
      const dir = dirs[router]
      if (dir && fileName.startsWith(dir + path.sep)) {
        const debugPaths = debugBuildPaths[router]
        // Undefined means unrestricted; an empty selection excludes all roots.
        return (
          debugPaths === undefined ||
          debugPaths.includes(fileName.slice(dir.length))
        )
      }
    }
    // Retain shared files outside the route directories.
    return true
  })
}
