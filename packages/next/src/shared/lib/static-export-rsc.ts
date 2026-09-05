export function getStaticExportRscFileSuffix(
  navigationBuildId: string
): string {
  return `.${navigationBuildId}.txt`
}

export function getStaticExportRscPath(
  pathname: string,
  navigationBuildId: string
): string {
  const suffix = getStaticExportRscFileSuffix(navigationBuildId)
  return pathname.endsWith('/')
    ? `${pathname}index${suffix}`
    : `${pathname}${suffix}`
}

export function stripStaticExportRscPath(
  pathname: string,
  navigationBuildId: string
): string {
  const suffix = getStaticExportRscFileSuffix(navigationBuildId)
  if (!pathname.endsWith(suffix)) {
    return pathname
  }

  const indexSuffix = `/index${suffix}`
  const length = pathname.endsWith(indexSuffix)
    ? indexSuffix.length - 1
    : suffix.length

  return pathname.slice(0, -length)
}
