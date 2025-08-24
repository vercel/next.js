import type { AdjustFontFallback } from '../../../../../font'
import type { Declaration } from 'postcss'
import postcss from 'postcss'

/**
 * The next/font postcss plugin receives the @font-face declarations returned from the next/font loaders.
 *
 * It hashes the font-family name to make it unguessable, it shouldn't be globally accessible.
 * If it were global, we wouldn't be able to tell which pages are using which fonts when generating preload tags.
 *
 * If the font loader returned fallback metrics, generate a fallback @font-face.
 *
 * If the font loader returned a variable name, add a CSS class that declares a variable containing the font and fallback fonts.
 *
 * Lastly, it adds the font-family to the exports object.
 * This enables you to access the actual font-family name, not just through the CSS class.
 * e.g:
 * const inter = Inter({ subsets: ['latin'] })
 * inter.style.fontFamily // => '__Inter_123456'
 */
const postcssNextFontPlugin = ({
  exports,
  fallbackFonts = [],
  adjustFontFallback,
  variable,
  weight,
  style,
}: {
  exports: { name: any; value: any }[]
  fallbackFonts?: string[]
  adjustFontFallback?: AdjustFontFallback
  variable?: string
  weight?: string
  style?: string
}) => {
  return {
    postcssPlugin: 'postcss-next-font',
    Once(root: any) {
      let fontFamily: string | undefined

      const normalizeFamily = (family: string) => {
        return family.replace(/['"]/g, '')
      }

      const formatFamily = (family: string) => {
        return `'${family}'`
      }

      // Hash font-family names
      for (const node of root.nodes) {
        if (node.type === 'atrule' && node.name === 'font-face') {
          const familyNode = node.nodes.find(
            (decl: Declaration) => decl.prop === 'font-family'
          )
          if (!familyNode) {
            continue
          }

          if (!fontFamily) {
            fontFamily = normalizeFamily(familyNode.value)
          }

          familyNode.value = formatFamily(fontFamily)
        }
      }

      if (!fontFamily) {
        throw new Error("Font loaders must return one or more @font-face's")
      }

      // Add fallback @font-face with the provided override values
      let adjustFontFallbackFamily: string | undefined
      if (adjustFontFallback) {
        adjustFontFallbackFamily = formatFamily(`${fontFamily} Fallback`)
        const fallbackFontFace = postcss.atRule({ name: 'font-face' })
        const {
          fallbackFont,
          ascentOverride,
          descentOverride,
          lineGapOverride,
          sizeAdjust,
        } = adjustFontFallback
        fallbackFontFace.nodes = [
          new postcss.Declaration({
            prop: 'font-family',
            value: adjustFontFallbackFamily,
          }),
          new postcss.Declaration({
            prop: 'src',
            value: `local("${fallbackFont}")`,
          }),
          ...(ascentOverride
            ? [
                new postcss.Declaration({
                  prop: 'ascent-override',
                  value: ascentOverride,
                }),
              ]
            : []),
          ...(descentOverride
            ? [
                new postcss.Declaration({
                  prop: 'descent-override',
                  value: descentOverride,
                }),
              ]
            : []),
          ...(lineGapOverride
            ? [
                new postcss.Declaration({
                  prop: 'line-gap-override',
                  value: lineGapOverride,
                }),
              ]
            : []),
          ...(sizeAdjust
            ? [
                new postcss.Declaration({
                  prop: 'size-adjust',
                  value: sizeAdjust,
                }),
              ]
            : []),
        ]
        root.nodes.push(fallbackFontFace)
      }

      // Variable fonts can define ranges of values
      const isRange = (value: string) => value.trim().includes(' ')

      // Format the font families to be used in the CSS
      const formattedFontFamilies = [
        formatFamily(fontFamily),
        ...(adjustFontFallbackFamily ? [adjustFontFallbackFamily] : []),
        ...fallbackFonts,
      ].join(', ')

      // Add class with family, weight and style
      const classRule = new postcss.Rule({ selector: '.className' })
      classRule.nodes = [
        new postcss.Declaration({
          prop: 'font-family',
          value: formattedFontFamilies,
        }),
        // If the font only has one weight or style, we can set it on the class
        ...(weight && !isRange(weight)
          ? [
              new postcss.Declaration({
                prop: 'font-weight',
                value: weight,
              }),
            ]
          : []),
        ...(style && !isRange(style)
          ? [
              new postcss.Declaration({
                prop: 'font-style',
                value: style,
              }),
            ]
          : []),
      ]
      root.nodes.push(classRule)

      // Add CSS class that defines a variable with the font families
      if (variable) {
        const varialbeRule = new postcss.Rule({ selector: '.variable' })
        varialbeRule.nodes = [
          new postcss.Declaration({
            prop: variable,
            value: formattedFontFamilies,
          }),
        ]
        root.nodes.push(varialbeRule)
      }

      // Export @font-face values as is
      exports.push({
        name: 'style',
        value: {
          fontFamily: formattedFontFamilies,
          fontWeight: !Number.isNaN(Number(weight))
            ? Number(weight)
            : undefined,
          fontStyle: style && !isRange(style) ? style : undefined,
        },
      })
    },
  }
}

postcssNextFontPlugin.postcss = true

export default postcssNextFontPlugin
