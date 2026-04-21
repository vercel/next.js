export const requiredTypeScriptVersion = '5.8.2'
export const requiredNodeTypesVersion = '20.17.6'

export function getTypeScriptPackageSpec(pkg: string) {
  switch (pkg) {
    case 'typescript':
      return `${pkg}@${requiredTypeScriptVersion}`
    case '@types/node':
      return `${pkg}@${requiredNodeTypesVersion}`
    default:
      return pkg
  }
}
