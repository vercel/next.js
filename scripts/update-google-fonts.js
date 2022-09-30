const fs = require('fs/promises')
const path = require('path')
const fetch = require('node-fetch')

;(async () => {
  const { familyMetadataList } = await fetch(
    'https://fonts.google.com/metadata/fonts'
  ).then((r) => r.json())

  let fontFunctions = `import type { FontModule } from 'next/font'
  type Display = 'auto'|'block'|'swap'|'fallback'|'optional'
  `
  const fontData = {}
  for (let { family, fonts, axes } of familyMetadataList) {
    let hasItalic = false
    const variants = Object.keys(fonts).map((variant) => {
      if (variant.endsWith('i')) {
        hasItalic = true
        return `${variant.slice(0, 3)}-italic`
      }
      return variant
    })

    const hasVariableFont = axes.length > 0

    let optionalAxes
    if (hasVariableFont) {
      variants.push('variable')
      if (hasItalic) {
        variants.push('variable-italic')
      }

      const nonWeightAxes = axes.filter(({ tag }) => tag !== 'wght')
      if (nonWeightAxes.length > 0) {
        optionalAxes = nonWeightAxes
      }
    }

    fontData[family] = {
      variants,
      axes: hasVariableFont ? axes : undefined,
    }
    const optionalIfVariableFont = hasVariableFont ? '?' : ''
    fontFunctions += `export declare function ${family.replaceAll(
      ' ',
      '_'
    )}(options${optionalIfVariableFont}: {
    variant${optionalIfVariableFont}:${variants
      .map((variant) => `"${variant}"`)
      .join('|')}
    display?:Display,
    preload?:boolean,
    fallback?: string[]
    adjustFontFallback?: boolean
    ${
      optionalAxes
        ? `axes?:(${optionalAxes.map(({ tag }) => `'${tag}'`).join('|')})[]`
        : ''
    }
    }):FontModule
    `
  }

  await Promise.all([
    fs.writeFile(
      path.join(__dirname, '../packages/font/src/google/index.ts'),
      fontFunctions
    ),
    fs.writeFile(
      path.join(__dirname, '../packages/font/src/google/font-data.json'),
      JSON.stringify(fontData, null, 2)
    ),
  ])
})()
