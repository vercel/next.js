import { nextFontError } from '../next-font-error'

const NORMAL_WEIGHT = 400
const BOLD_WEIGHT = 700

/**
 * Convert the weight string to a number so it can be used for comparison.
 * Weights can be defined as a number, 'normal' or 'bold'. https://developer.mozilla.org/docs/Web/CSS/@font-face/font-weight
 */
function getWeightNumber(weight: string) {
  return weight === 'normal'
    ? NORMAL_WEIGHT
    : weight === 'bold'
    ? BOLD_WEIGHT
    : Number(weight)
}

/**
 * Get the distance from normal (400) weight for the provided weight.
 * If it's not a variable font we can just return the distance.
 * If it's a variable font we need to compare its weight range to 400.
 */
function getDistanceFromNormalWeight(weight?: string) {
  if (!weight) return 0

  // If it's a variable font the weight is defined with two numbers "100 900", rather than just one "400"
  const [firstWeight, secondWeight] = weight
    .trim()
    .split(/ +/)
    .map(getWeightNumber)

  if (Number.isNaN(firstWeight) || Number.isNaN(secondWeight)) {
    nextFontError(
      `Invalid weight value in src array: \`${weight}\`.\nExpected \`normal\`, \`bold\` or a number.`
    )
  }

  // If the weight doesn't have have a second value, it's not a variable font
  // If that's the case, just return the distance from normal weight
  if (!secondWeight) {
    return firstWeight - NORMAL_WEIGHT
  }

  // Normal weight is within variable font range
  if (firstWeight <= NORMAL_WEIGHT && secondWeight >= NORMAL_WEIGHT) {
    return 0
  }

  // Normal weight is outside variable font range
  // Return the distance of normal weight to the variable font range
  const firstWeightDistance = firstWeight - NORMAL_WEIGHT
  const secondWeightDistance = secondWeight - NORMAL_WEIGHT
  if (Math.abs(firstWeightDistance) < Math.abs(secondWeightDistance)) {
    return firstWeightDistance
  }
  return secondWeightDistance
}

/**
 * If multiple font files are provided for a font family, we need to pick one to use for the automatic fallback generation.
 * This function returns the font file that is most likely to be used for the bulk of the text on a page.
 *
 * There are some assumptions here about the text on a page when picking the font file:
 * - Most of the text will have normal weight, use the one closest to 400
 * - Most of the text will have normal style, prefer normal over italic
 * - If two font files have the same distance from normal weight, the thinner one will most likely be the bulk of the text
 */
export function pickFontFileForFallbackGeneration<
  T extends { style?: string; weight?: string }
>(fontFiles: T[]): T {
  return fontFiles.reduce((usedFontFile, currentFontFile) => {
    if (!usedFontFile) return currentFontFile

    const usedFontDistance = getDistanceFromNormalWeight(usedFontFile.weight)
    const currentFontDistance = getDistanceFromNormalWeight(
      currentFontFile.weight
    )

    // Prefer normal style if they have the same weight
    if (
      usedFontDistance === currentFontDistance &&
      (typeof currentFontFile.style === 'undefined' ||
        currentFontFile.style === 'normal')
    ) {
      return currentFontFile
    }

    const absUsedDistance = Math.abs(usedFontDistance)
    const absCurrentDistance = Math.abs(currentFontDistance)

    // Use closest absolute distance to normal weight
    if (absCurrentDistance < absUsedDistance) return currentFontFile

    // Prefer the thinner font if both have the same absolute distance from normal weight
    if (
      absUsedDistance === absCurrentDistance &&
      currentFontDistance < usedFontDistance
    ) {
      return currentFontFile
    }

    return usedFontFile
  })
}
