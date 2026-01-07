import getRouteFromAssetPath from '../shared/lib/router/utils/get-route-from-asset-path'

export default function matchBundle(
  regex: RegExp,
  input: string
): string | null {
  const result = regex.exec(input)

  if (!result) {
    return null
  }

  return getRouteFromAssetPath(`/${result[1]}`)
}
