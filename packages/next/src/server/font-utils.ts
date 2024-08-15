import * as Log from '../build/output/log'
import {
  GOOGLE_FONT_PROVIDER,
  DEFAULT_SERIF_FONT,
  DEFAULT_SANS_SERIF_FONT,
} from '../shared/lib/constants'
const capsizeFontsMetrics = require('next/dist/server/capsize-font-metrics.json')

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36'
const IE_UA = 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko'

export type FontManifest = Array<{
  url: string
  content: string
}>

export type FontConfig = boolean

function isGoogleFont(url: string): boolean {
  return url.startsWith(GOOGLE_FONT_PROVIDER)
}

async function getFontForUA(url: string, UA: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  return await res.text()
}

export async function getFontDefinitionFromNetwork(
  url: string
): Promise<string> {
  let result = ''
  /**
   * The order of IE -> Chrome is important, other wise chrome starts loading woff1.
   * CSS cascading 🤷‍♂️.
   */
  try {
    if (isGoogleFont(url)) {
      result += await getFontForUA(url, IE_UA)
    }
    result += await getFontForUA(url, CHROME_UA)
  } catch (e) {
    Log.warn(
      `Failed to download the stylesheet for ${url}. Skipped optimizing this font.`
    )
    return ''
  }

  return result
}

function parseGoogleFontName(css: string): Array<string> {
  const regex = /font-family: ([^;]*)/g
  const matches = css.matchAll(regex)
  const fontNames = new Set<string>()

  for (let font of matches) {
    const fontFamily = font[1].replace(/^['"]|['"]$/g, '')
    fontNames.add(fontFamily)
  }

  return [...fontNames]
}

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

export function calculateOverrideValues(fontName: string) {
  const fontKey = formatName(fontName)
  const fontMetrics = capsizeFontsMetrics[fontKey]
  let { category, ascent, descent, lineGap, unitsPerEm } = fontMetrics
  const fallbackFont =
    category === 'serif' ? DEFAULT_SERIF_FONT : DEFAULT_SANS_SERIF_FONT
  ascent = formatOverrideValue(ascent / unitsPerEm)
  descent = formatOverrideValue(descent / unitsPerEm)
  lineGap = formatOverrideValue(lineGap / unitsPerEm)

  return {
    ascent,
    descent,
    lineGap,
    fallbackFont: fallbackFont.name,
  }
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

function calculateOverrideCSS(font: string) {
  const fontName = font.trim()

  const { ascent, descent, lineGap, fallbackFont } =
    calculateOverrideValues(fontName)

  return `
    @font-face {
      font-family: "${fontName} Fallback";
      ascent-override: ${ascent}%;
      descent-override: ${descent}%;
      line-gap-override: ${lineGap}%;
      src: local("${fallbackFont}");
    }
  `
}

function calculateSizeAdjustCSS(font: string) {
  const fontName = font.trim()

  const { ascent, descent, lineGap, fallbackFont, sizeAdjust } =
    calculateSizeAdjustValues(fontName)

  return `
    @font-face {
      font-family: "${fontName} Fallback";
      ascent-override: ${ascent}%;
      descent-override: ${descent}%;
      line-gap-override: ${lineGap}%;
      size-adjust: ${sizeAdjust}%;
      src: local("${fallbackFont}");
    }
  `
}

export function getFontOverrideCss(
  url: string,
  css: string,
  useSizeAdjust = false
) {
  if (!isGoogleFont(url)) {
    return ''
  }

  const calcFn = useSizeAdjust ? calculateSizeAdjustCSS : calculateOverrideCSS

  try {
    const fontNames = parseGoogleFontName(css)

    const fontCss = fontNames.reduce((cssStr, fontName) => {
      cssStr += calcFn(fontName)
      return cssStr
    }, '')

    return fontCss
  } catch (e) {
    console.log('Error getting font override values - ', e)
    return ''
  }
}
