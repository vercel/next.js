/** React that's compiled with `next`. Used by App Router. */
export const reactVendoredRe =
  /[\\/]next[\\/]dist[\\/]compiled[\\/](react|react-dom|react-server-dom-(webpack|turbopack)|scheduler)[\\/]/

/** React the user installed. Used by Pages Router, or user imports in App Router. */
export const reactNodeModulesRe =
  /node_modules[\\/](react|react-dom|scheduler)[\\/]/

export const nextInternalsRe =
  /(node_modules[\\/]next[\\/]|[\\/].next[\\/]static[\\/]chunks[\\/]webpack\.js$|(edge-runtime-webpack|webpack-runtime)\.js$)/

export default function isInternal(file: string | null) {
  if (!file) return false

  return (
    nextInternalsRe.test(file) ||
    reactVendoredRe.test(file) ||
    reactNodeModulesRe.test(file)
  )
}
