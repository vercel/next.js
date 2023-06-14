import { formatAvailableValues } from '../format-available-values'
import { nextFontError } from '../next-font-error'
import { googleFontsMetadata } from './google-fonts-metadata'

/**
 * Validates and gets the data for each font axis required to generate the Google Fonts URL.
 */
export function getFontAxes(
  fontFamily: string,
  weights: string[],
  styles: string[],
  selectedVariableAxes?: string[]
): {
  wght?: string[]
  ital?: string[]
  variableAxes?: [string, string][]
} {
  const hasItalic = styles.includes('italic')
  const hasNormal = styles.includes('normal')
  // Make sure the order is correct, otherwise Google Fonts will return an error
  // If only normal is set, we can skip returning the ital axis as normal is the default
  const ital = hasItalic ? [...(hasNormal ? ['0'] : []), '1'] : undefined

  // Weights will always contain one element if it's a variable font
  if (weights[0] === 'variable') {
    // Get all the available axes for the current font from the metadata file
    const allAxes = googleFontsMetadata[fontFamily].axes
    if (!allAxes) {
      throw new Error('invariant variable font without axes')
    }

    if (selectedVariableAxes) {
      // The axes other than weight and style that can be defined for the current variable font
      const defineAbleAxes: string[] = allAxes
        .map(({ tag }) => tag)
        .filter((tag) => tag !== 'wght')

      if (defineAbleAxes.length === 0) {
        nextFontError(`Font \`${fontFamily}\` has no definable \`axes\``)
      }
      if (!Array.isArray(selectedVariableAxes)) {
        nextFontError(
          `Invalid axes value for font \`${fontFamily}\`, expected an array of axes.\nAvailable axes: ${formatAvailableValues(
            defineAbleAxes
          )}`
        )
      }
      selectedVariableAxes.forEach((key) => {
        if (!defineAbleAxes.some((tag) => tag === key)) {
          nextFontError(
            `Invalid axes value \`${key}\` for font \`${fontFamily}\`.\nAvailable axes: ${formatAvailableValues(
              defineAbleAxes
            )}`
          )
        }
      })
    }

    let weightAxis: string | undefined
    let variableAxes: [string, string][] | undefined
    for (const { tag, min, max } of allAxes) {
      if (tag === 'wght') {
        // In variable fonts the weight is a range
        weightAxis = `${min}..${max}`
      } else if (selectedVariableAxes?.includes(tag)) {
        if (!variableAxes) {
          variableAxes = []
        }
        variableAxes.push([tag, `${min}..${max}`])
      }
    }

    return {
      wght: weightAxis ? [weightAxis] : undefined,
      ital,
      variableAxes,
    }
  } else {
    return {
      ital,
      wght: weights,
    }
  }
}
