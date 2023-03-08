import type { Font } from 'fontkit'
import type { AdjustFontFallback } from 'next/font'

// The font metadata of the fallback fonts, retrieved with fontkit on system font files
// The average width is calculated with the calcAverageWidth function below
const DEFAULT_SANS_SERIF_FONT = {
  name: 'Arial',
  azAvgWidth: 934.5116279069767,
  unitsPerEm: 2048,
}
const DEFAULT_SERIF_FONT = {
  name: 'Times New Roman',
  azAvgWidth: 854.3953488372093,
  unitsPerEm: 2048,
}

/**
 * Calculate the average character width of a font file.
 * Used to calculate the size-adjust property by comparing the fallback average with the loaded font average.
 */
function calcAverageWidth(font: Font): number | undefined {
  try {
    /**
     * Finding the right characters to use when calculating the average width is tricky.
     * We can't just use the average width of all characters, because we have to take letter frequency into account.
     * We also have to take word length into account, because the font's space width usually differ a lot from other characters.
     * The goal is to find a string that'll give you a good average width, given most texts in most languages.
     *
     * TODO: Currently only works for the latin alphabet. Support more languages by finding the right characters for additional languages.
     *
     * The used characters were decided through trial and error with letter frequency and word length tables as a guideline.
     * E.g. https://en.wikipedia.org/wiki/Letter_frequency
     */
    const avgCharacters = 'aaabcdeeeefghiijklmnnoopqrrssttuvwxyz      '
    // Check if the font file has all the characters we need to calculate the average width
    const hasAllChars = font
      .glyphsForString(avgCharacters)
      .flatMap((glyph) => glyph.codePoints)
      .every((codePoint) => font.hasGlyphForCodePoint(codePoint))

    if (!hasAllChars) return undefined

    const widths = font
      .glyphsForString(avgCharacters)
      .map((glyph) => glyph.advanceWidth)
    const totalWidth = widths.reduce((sum, width) => sum + width, 0)
    return totalWidth / widths.length
  } catch {
    // Could not calculate average width from the font file, skip size-adjust
    return undefined
  }
}

function formatOverrideValue(val: number) {
  return Math.abs(val * 100).toFixed(2) + '%'
}

/**
 * Given a font file and category, calculate the fallback font override values.
 * The returned values can be used to generate a CSS @font-face declaration.
 *
 * For example:
 * @font-face {
 *   font-family: local-font;
 *   src: local(Arial);
 *   size-adjust: 90%;
 * }
 *
 * Read more about this technique in these texts by the Google Aurora team:
 * https://developer.chrome.com/blog/font-fallbacks/
 * https://docs.google.com/document/d/e/2PACX-1vRsazeNirATC7lIj2aErSHpK26hZ6dA9GsQ069GEbq5fyzXEhXbvByoftSfhG82aJXmrQ_sJCPBqcx_/pub
 */
export function getFallbackMetricsFromFontFile(
  font: Font,
  category = 'serif'
): AdjustFontFallback {
  const fallbackFont =
    category === 'serif' ? DEFAULT_SERIF_FONT : DEFAULT_SANS_SERIF_FONT

  const azAvgWidth = calcAverageWidth(font)
  const { ascent, descent, lineGap, unitsPerEm } = font

  const fallbackFontAvgWidth = fallbackFont.azAvgWidth / fallbackFont.unitsPerEm
  let sizeAdjust = azAvgWidth
    ? azAvgWidth / unitsPerEm / fallbackFontAvgWidth
    : 1

  return {
    ascentOverride: formatOverrideValue(ascent / (unitsPerEm * sizeAdjust)),
    descentOverride: formatOverrideValue(descent / (unitsPerEm * sizeAdjust)),
    lineGapOverride: formatOverrideValue(lineGap / (unitsPerEm * sizeAdjust)),
    fallbackFont: fallbackFont.name,
    sizeAdjust: formatOverrideValue(sizeAdjust),
  }
}
