// @ts-ignore
import { calculateSizeAdjustValues } from 'next/dist/server/font-utils'
// @ts-ignore
import * as Log from 'next/dist/build/output/log'

/**
 * Get precalculated fallback font metrics for the Google Fonts family.
 *
 * TODO:
 * We might want to calculate these values with fontkit instead (like in next/font/local).
 * That way we don't have to update the precalculated values every time a new font is added to Google Fonts.
 */
export function getFallbackFontOverrideMetrics(fontFamily: string) {
  try {
    const { ascent, descent, lineGap, fallbackFont, sizeAdjust } =
      calculateSizeAdjustValues(fontFamily)
    return {
      fallbackFont,
      ascentOverride: `${ascent}%`,
      descentOverride: `${descent}%`,
      lineGapOverride: `${lineGap}%`,
      sizeAdjust: `${sizeAdjust}%`,
    }
  } catch {
    Log.error(`Failed to find font override values for font \`${fontFamily}\``)
  }
}
