import fs from 'fs'
// @ts-ignore
import fetch from 'next/dist/compiled/node-fetch'
// @ts-ignore
import { calculateSizeAdjustValues } from 'next/dist/server/font-utils'
// @ts-ignore
import * as Log from 'next/dist/build/output/log'
import { nextFontError } from '../utils'
import fontData from './font-data.json'
import { getProxyAgent } from './get-proxy-agent'
const allowedDisplayValues = ['auto', 'block', 'swap', 'fallback', 'optional']

const formatValues = (values: string[]) =>
  values.map((val) => `\`${val}\``).join(', ')

type FontOptions = {
  fontFamily: string
  weights: string[]
  styles: string[]
  display: string
  preload: boolean
  selectedVariableAxes?: string[]
  fallback?: string[]
  adjustFontFallback: boolean
  variable?: string
  subsets: string[]
}
export function validateData(
  functionName: string,
  data: any,
  config: any
): FontOptions {
  let {
    weight,
    style,
    preload = true,
    display = 'swap',
    axes,
    fallback,
    adjustFontFallback = true,
    variable,
    subsets: callSubsets,
  } = data[0] || ({} as any)
  // Get the subsets defined for the font from either next.config.js or the function call. If both are present, pick the function call subsets.
  const subsets = callSubsets ?? config?.subsets ?? []

  if (functionName === '') {
    nextFontError(`next/font/google has no default export`)
  }

  const fontFamily = functionName.replace(/_/g, ' ')
  // Get the Google font metadata, we'll use this to validate the font arguments and to print better error messages
  const fontFamilyData = (fontData as any)[fontFamily]
  if (!fontFamilyData) {
    nextFontError(`Unknown font \`${fontFamily}\``)
  }

  const availableSubsets = fontFamilyData.subsets
  if (availableSubsets.length === 0) {
    // If the font doesn't have any preloadeable subsets, disable preload
    preload = false
  } else {
    if (preload && !callSubsets && !config?.subsets) {
      nextFontError(
        `Missing selected subsets for font \`${fontFamily}\`. Please specify subsets in the function call or in your \`next.config.js\`. Read more: https://nextjs.org/docs/messages/google-fonts-missing-subsets`
      )
    }
    subsets.forEach((subset: string) => {
      if (!availableSubsets.includes(subset)) {
        nextFontError(
          `Unknown subset \`${subset}\` for font \`${fontFamily}\`.\nAvailable subsets: ${formatValues(
            availableSubsets
          )}`
        )
      }
    })
  }

  const fontWeights = fontFamilyData.weights
  const fontStyles = fontFamilyData.styles

  // Get the unique weights and styles from the function call
  const weights = !weight
    ? []
    : [...new Set(Array.isArray(weight) ? weight : [weight])]
  const styles = !style
    ? []
    : [...new Set(Array.isArray(style) ? style : [style])]

  if (weights.length === 0) {
    // Set variable as default, throw if not available
    if (fontWeights.includes('variable')) {
      weights.push('variable')
    } else {
      nextFontError(
        `Missing weight for font \`${fontFamily}\`.\nAvailable weights: ${formatValues(
          fontWeights
        )}`
      )
    }
  }

  if (weights.length > 1 && weights.includes('variable')) {
    nextFontError(
      `Unexpected \`variable\` in weight array for font \`${fontFamily}\`. You only need \`variable\`, it includes all available weights.`
    )
  }

  weights.forEach((selectedWeight) => {
    if (!fontWeights.includes(selectedWeight)) {
      nextFontError(
        `Unknown weight \`${selectedWeight}\` for font \`${fontFamily}\`.\nAvailable weights: ${formatValues(
          fontWeights
        )}`
      )
    }
  })

  if (styles.length === 0) {
    if (fontStyles.length === 1) {
      // Handle default style for fonts that only have italic
      styles.push(fontStyles[0])
    } else {
      // Otherwise set default style to normal
      styles.push('normal')
    }
  }

  styles.forEach((selectedStyle) => {
    if (!fontStyles.includes(selectedStyle)) {
      nextFontError(
        `Unknown style \`${selectedStyle}\` for font \`${fontFamily}\`.\nAvailable styles: ${formatValues(
          fontStyles
        )}`
      )
    }
  })

  if (!allowedDisplayValues.includes(display)) {
    nextFontError(
      `Invalid display value \`${display}\` for font \`${fontFamily}\`.\nAvailable display values: ${formatValues(
        allowedDisplayValues
      )}`
    )
  }

  if (weights[0] !== 'variable' && axes) {
    nextFontError('Axes can only be defined for variable fonts')
  }

  return {
    fontFamily,
    weights,
    styles,
    display,
    preload,
    selectedVariableAxes: axes,
    fallback,
    adjustFontFallback,
    variable,
    subsets,
  }
}

/**
 * Generate the Google Fonts URL given the requested weight(s), style(s) and additional variable axes
 */
export function getUrl(
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
      .sort()
      .join(';')}`
  }

  url = `${url}&display=${display}`

  return url
}

/**
 * Fetches the CSS containing the @font-face declarations from Google Fonts.
 * The fetch has a user agent header with a modern browser to ensure we'll get .woff2 files.
 *
 * The env variable NEXT_FONT_GOOGLE_MOCKED_RESPONSES may be set containing a path to mocked data.
 * It's used to defined mocked data to avoid hitting the Google Fonts API during tests.
 */
export async function fetchCSSFromGoogleFonts(
  url: string,
  fontFamily: string
): Promise<string> {
  // Check if mocked responses are defined, if so use them instead of fetching from Google Fonts
  let mockedResponse: string | undefined
  if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
    const mockFile = require(process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES)
    mockedResponse = mockFile[url]
    if (!mockedResponse) {
      nextFontError('Missing mocked response for URL: ' + url)
    }
  }

  let cssResponse: string
  if (mockedResponse) {
    // Just use the mocked CSS if it's set
    cssResponse = mockedResponse
  } else {
    const res = await fetch(url, {
      agent: getProxyAgent(),
      headers: {
        // The file format is based off of the user agent, make sure woff2 files are fetched
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36',
      },
    })

    if (!res.ok) {
      nextFontError(`Failed to fetch font  \`${fontFamily}\`.\nURL: ${url}`)
    }

    cssResponse = await res.text()
  }

  return cssResponse
}

/**
 * Fetch the url and return a buffer with the font file.
 */
export async function fetchFontFile(url: string) {
  // Check if we're using mocked data
  if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
    // If it's an absolute path, read the file from the filesystem
    if (url.startsWith('/')) {
      return fs.readFileSync(url)
    }
    // Otherwise just return a unique buffer
    return Buffer.from(url)
  }

  const arrayBuffer = await fetch(url, { agent: getProxyAgent() }).then(
    (r: any) => r.arrayBuffer()
  )
  return Buffer.from(arrayBuffer)
}

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
  // Get all the available axes for the current font from the metadata file
  const allAxes: Array<{ tag: string; min: number; max: number }> = (
    fontData as any
  )[fontFamily].axes

  const hasItalic = styles.includes('italic')
  const hasNormal = styles.includes('normal')
  // Make sure the order is correct, otherwise Google Fonts will return an error
  // If only normal is set, we can skip returning the ital axis as normal is the default
  const ital = hasItalic ? [...(hasNormal ? ['0'] : []), '1'] : undefined

  // Weights will always contain one element if it's a variable font
  if (weights[0] === 'variable') {
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
          `Invalid axes value for font \`${fontFamily}\`, expected an array of axes.\nAvailable axes: ${formatValues(
            defineAbleAxes
          )}`
        )
      }
      selectedVariableAxes.forEach((key) => {
        if (!defineAbleAxes.some((tag) => tag === key)) {
          nextFontError(
            `Invalid axes value \`${key}\` for font \`${fontFamily}\`.\nAvailable axes: ${formatValues(
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
      calculateSizeAdjustValues(
        require('next/dist/server/google-font-metrics.json')[fontFamily]
      )
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

/**
 * Find all font files in the CSS response and determine which files should be preloaded.
 * In Google Fonts responses, the @font-face's subset is above it in a comment.
 * Walk through the CSS from top to bottom, keeping track of the current subset.
 */
export function findFontFilesInCss(css: string, subsetsToPreload?: string[]) {
  // Find font files to download
  const fontFiles: Array<{
    googleFontFileUrl: string
    preloadFontFile: boolean
  }> = []

  // Keep track of the current subset
  let currentSubset = ''
  for (const line of css.split('\n')) {
    const newSubset = /\/\* (.+?) \*\//.exec(line)?.[1]
    if (newSubset) {
      // Found new subset in a comment above the next @font-face declaration
      currentSubset = newSubset
    } else {
      const googleFontFileUrl = /src: url\((.+?)\)/.exec(line)?.[1]
      if (
        googleFontFileUrl &&
        !fontFiles.some(
          (foundFile) => foundFile.googleFontFileUrl === googleFontFileUrl
        )
      ) {
        // Found the font file in the @font-face declaration.
        fontFiles.push({
          googleFontFileUrl,
          preloadFontFile: !!subsetsToPreload?.includes(currentSubset),
        })
      }
    }
  }

  return fontFiles
}
