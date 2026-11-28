// Packages that make up the framework itself. Frames from these are never
// attributed as the third-party code that triggered an error.
const FRAMEWORK_PACKAGES = new Set([
  'next',
  'react',
  'react-dom',
  'scheduler',
  'styled-jsx',
  '@swc/helpers',
])

function isFrameworkPackage(packageName: string): boolean {
  return (
    FRAMEWORK_PACKAGES.has(packageName) ||
    packageName.startsWith('@next/') ||
    packageName.startsWith('react-server-dom-')
  )
}

/**
 * Returns the name of the third-party package that contains `file`, or `null`
 * if `file` is not inside `node_modules` or belongs to the framework.
 *
 * `file` can be a path, a `file:` URL, or a bundler source URL such as
 * `[project]/node_modules/pkg/index.js` or `webpack://_N_E/./node_modules/pkg/index.js`.
 * The innermost `node_modules` segment decides, so pnpm's virtual store
 * (`node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js`) resolves to `pkg`.
 */
export function getThirdPartyPackageName(file: string): string | null {
  const segments = ('/' + file.replace(/\\/g, '/')).split('/node_modules/')
  if (segments.length < 2) {
    return null
  }

  // Dependencies that live inside the framework's own install (e.g.
  // `node_modules/next/node_modules/foo`) are part of the framework too.
  for (let i = 1; i < segments.length - 1; i++) {
    const outerPackageName = getLeadingPackageName(segments[i])
    if (outerPackageName !== null && isFrameworkPackage(outerPackageName)) {
      return null
    }
  }

  const packageName = getLeadingPackageName(segments[segments.length - 1])
  if (packageName === null || isFrameworkPackage(packageName)) {
    return null
  }
  return packageName
}

function getLeadingPackageName(pathInNodeModules: string): string | null {
  const parts = pathInNodeModules.split('/')
  const first = parts[0]
  if (first === undefined || first === '' || first.startsWith('.')) {
    return null
  }
  if (first.startsWith('@')) {
    const second = parts[1]
    if (second === undefined || second === '') {
      return null
    }
    return `${first}/${second}`
  }
  return first
}
