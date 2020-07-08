import formatVariantPrice from './format-variant-price'

export const isSize = (option) => option.name === 'Size'

export const isColor = (option) => option.name === 'Color'

export function getVariantMetadata(variant, variants) {
  const data = {
    ...formatVariantPrice(variant),
    size: variant.selectedOptions.find(isSize),
    color: variant.selectedOptions.find(isColor),
    // Use a Set to avoid duplicates
    colors: new Set(),
    colorsBySize: new Map(),
  }

  variants.forEach(({ node }) => {
    const nodeSize = node.selectedOptions.find(isSize)
    const nodeColor = node.selectedOptions.find(isColor)

    if (nodeColor) data.colors.add(nodeColor.value)
    if (nodeSize) {
      const sizeColors = data.colorsBySize.get(nodeSize.value) || []

      if (nodeColor) sizeColors.push(nodeColor.value)

      data.colorsBySize.set(nodeSize.value, sizeColors)
    }
  })

  return data
}
