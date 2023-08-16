import { parsePath } from '../shared/lib/router/utils/parse-path'

export function removeLocale(path: string, locale?: string) {
  if (process.env.__NEXT_I18N_SUPPORT) {
    const { pathname } = parsePath(path)
    const pathLower = pathname.toLowerCase()
    const localeLower = locale?.toLowerCase()

    return locale &&
      (pathLower.startsWith(`/${localeLower}/`) ||
        pathLower === `/${localeLower}`)
      ? `${pathname.length === locale.length + 1 ? `/` : ``}${path.slice(
          locale.length + 1
        )}`
      : path
  }
  return path
}
