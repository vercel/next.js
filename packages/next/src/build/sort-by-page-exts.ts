import { extname } from 'path/posix'
import type { PageExtensions } from './page-extensions-type'

export function sortByPageExts(pageExtensions: PageExtensions) {
  return (a: string, b: string) => {
    // prioritize entries according to pageExtensions order
    // for consistency as fs order can differ across systems
    // NOTE: this is reversed so preferred comes last and
    // overrides prior
    const aExt = extname(a)
    const bExt = extname(b)

    const aNoExt = a.substring(0, a.length - aExt.length)
    const bNoExt = b.substring(0, b.length - bExt.length)

    if (aNoExt !== bNoExt) return 0

    // find extension index (skip '.' as pageExtensions doesn't have it)
    const aExtIndex = pageExtensions.indexOf(aExt.substring(1))
    const bExtIndex = pageExtensions.indexOf(bExt.substring(1))

    return bExtIndex - aExtIndex
  }
}
