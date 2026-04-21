export const requiredTypeScriptVersion = '5.8.2'

export function getTypeScriptPackageSpec(pkg: string) {
  return pkg === 'typescript' ? `${pkg}@${requiredTypeScriptVersion}` : pkg
}
