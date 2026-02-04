import {
  DEFAULT_SERIF_FONT,
  DEFAULT_SANS_SERIF_FONT,
} from '../shared/lib/constants'
const capsizeFontsMetrics = require('next/dist/server/capsize-font-metrics.json')

function formatName(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index === 0 ? word.toLowerCase() : word.toUpperCase()
    })
    .replace(/\s+/g, '')
}

function formatOverrideValue(val: number) {
  return Math.abs(val * 100).toFixed(2)
}

export function calculateSizeAdjustValues(fontName: string) {
  const fontKey = formatName(fontName)
  const fontMetrics = capsizeFontsMetrics[fontKey]
  let { category, ascent, descent, lineGap, unitsPerEm, xWidthAvg } =
    fontMetrics
  const mainFontAvgWidth = xWidthAvg / unitsPerEm
  const fallbackFont =
    category === 'serif' ? DEFAULT_SERIF_FONT : DEFAULT_SANS_SERIF_FONT
  const fallbackFontName = formatName(fallbackFont.name)
  const fallbackFontMetrics = capsizeFontsMetrics[fallbackFontName]
  const fallbackFontAvgWidth =
    fallbackFontMetrics.xWidthAvg / fallbackFontMetrics.unitsPerEm
  let sizeAdjust = xWidthAvg ? mainFontAvgWidth / fallbackFontAvgWidth : 1

  ascent = formatOverrideValue(ascent / (unitsPerEm * sizeAdjust))
  descent = formatOverrideValue(descent / (unitsPerEm * sizeAdjust))
  lineGap = formatOverrideValue(lineGap / (unitsPerEm * sizeAdjust))

  return {
    ascent,
    descent,
    lineGap,
    fallbackFont: fallbackFont.name,
    sizeAdjust: formatOverrideValue(sizeAdjust),
  }
}
