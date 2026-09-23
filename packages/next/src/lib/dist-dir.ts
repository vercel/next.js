import * as path from 'node:path'

export class InvalidDistDirError extends Error {
  constructor(distDir: string, appDir: string, workspaceRoot: string) {
    super(
      `The configured distDir should be inside of the application directory ` +
        `or the workspace containing it, and must not contain the application ` +
        `directory itself:\n\n` +
        `  distDir:        ${distDir}\n` +
        `  application:    ${appDir}\n` +
        `  workspace root: ${workspaceRoot}\n\n` +
        `Read more: https://nextjs.org/docs/messages/invalid-dist-dir`
    )
    this.name = 'InvalidDistDirError'
  }
}

/** Whether `descendant` is strictly inside `ancestor`. */
// TODO: Account for symlinks when validating containment.
function isStrictlyInside(ancestor: string, descendant: string): boolean {
  const relative = path.relative(path.resolve(ancestor), descendant)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  )
}

/**
 * Throws unless `distDir` is inside the application or workspace, without
 * containing the application itself.
 */
export function verifyDistDir(
  distDir: string,
  appDir: string,
  workspaceRoot: string
): void {
  const resolvedDistDir = path.resolve(distDir)
  const resolvedAppDir = path.resolve(appDir)
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot)

  const isInsideBoundary =
    isStrictlyInside(resolvedAppDir, resolvedDistDir) ||
    isStrictlyInside(resolvedWorkspaceRoot, resolvedDistDir)
  const containsApp =
    resolvedDistDir === resolvedAppDir ||
    isStrictlyInside(resolvedDistDir, resolvedAppDir)

  if (isInsideBoundary && !containsApp) {
    return
  }

  throw new InvalidDistDirError(
    resolvedDistDir,
    resolvedAppDir,
    resolvedWorkspaceRoot
  )
}
