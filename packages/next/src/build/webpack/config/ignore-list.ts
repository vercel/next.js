import { NEXT_PROJECT_ROOT } from '../../next-dir-paths'

const nextRelativePath = NEXT_PROJECT_ROOT.replace(process.cwd() + '/', '')

export function shouldIgnorePath(modulePath: string): boolean {
  return (
    modulePath.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    modulePath.includes('next/dist') ||
    // TODO: turbopack recovers the original source path of the next package
    (!!process.env.TURBOPACK && modulePath.startsWith(nextRelativePath))
  )
}
