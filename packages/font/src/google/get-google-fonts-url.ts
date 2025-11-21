import { sortFontsVariantValues } from './sort-fonts-variant-values'

/**
 * Generate the Google Fonts URL given the requested weight(s), style(s) and additional variable axes
 */
export function getGoogleFontsUrl(
  fontFamily: string,
  axes: {
    wght?: string[]
    ital?: string[]
    variableAxes?: [string, string][]
  },
  display: string
) {
  // Variants are all combinations of weight and style, each variant will result in a separate font file
  const variants: Array<[string, string][]> = []
  if (axes.wght) {
    for (const wght of axes.wght) {
      if (!axes.ital) {
        variants.push([['wght', wght], ...(axes.variableAxes ?? [])])
      } else {
        for (const ital of axes.ital) {
          variants.push([
            ['ital', ital],
            ['wght', wght],
            ...(axes.variableAxes ?? []),
          ])
        }
      }
    }
  } else if (axes.variableAxes) {
    // Variable fonts might not have a range of weights, just add optional variable axes in that case
    variants.push([...axes.variableAxes])
  }

  // Google api requires the axes to be sorted, starting with lowercase words
  if (axes.variableAxes) {
    variants.forEach((variant) => {
      variant.sort(([a], [b]) => {
        const aIsLowercase = a.charCodeAt(0) > 96
        const bIsLowercase = b.charCodeAt(0) > 96
        if (aIsLowercase && !bIsLowercase) return -1
        if (bIsLowercase && !aIsLowercase) return 1

        return a > b ? 1 : -1
      })
    })
  }

  let url = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(
    / /g,
    '+'
  )}`

  if (variants.length > 0) {
    url = `${url}:${variants[0].map(([key]) => key).join(',')}@${variants
      .map((variant) => variant.map(([, val]) => val).join(','))
      .sort(sortFontsVariantValues)
      .join(';')}`
  }

  url = `${url}&display=${display}`

  return url
}
