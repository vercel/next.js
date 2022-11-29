import type { Font } from 'fontkit'
import type { AdjustFontFallback } from 'next/font'

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

function calcAverageWidth(font: Font): number | undefined {
  try {
    const avgCharacters = 'aaabcdeeeefghiijklmnnoopqrrssttuvwxyz      '
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

export function calculateFallbackFontValues(
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

export function nextFontError(message: string): never {
  const err = new Error(message)
  err.name = 'NextFontError'
  throw err
}
