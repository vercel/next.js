import type { Page } from '../shared/lib/route-types'
import getRouteFromAssetPath from '../shared/lib/router/utils/get-route-from-asset-path'

export default function matchBundle(regex: RegExp, input: string): Page | null {
  const result = regex.exec(input)

  if (!result) {
    return null
  }

  return getRouteFromAssetPath(`/${result[1]}`)
}
