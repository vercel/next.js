/** React that's compiled with `next`. Used by App Router. */
export const reactVendoredRe =
  // TODO: Why no react-is?
  /[\\/]next[\\/]dist[\\/]compiled[\\/](react|react-dom|react-markup|react-server-dom-(webpack|turbopack)|scheduler)[\\/]/

/** React the user installed. Used by Pages Router, or user imports in App Router. */
export const reactNodeModulesRe =
  // TODO: Why no react-is?
  /node_modules[\\/](react|react-dom|react-markup|scheduler)[\\/]/

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
