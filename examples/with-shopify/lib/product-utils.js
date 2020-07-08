import { useMemo } from 'react'
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

export function getImages(product) {
  // 1. Use a Map to avoid duplicated images, product variants may be
  // using the default image of the product
  const images = new Map()

  // 2. Append the images that are assigned to a variant
  product.variants.edges.forEach(({ node }) => {
    images.set(node.image.originalSrc, node.image)
  })

  // 3. Append any remaining images that are in the product and not assigned to a variant
  product.images.edges.forEach(({ node }) => {
    images.set(node.originalSrc, node)
  })

  return images
}

export function useImages(product) {
  return useMemo(() => getImages(product), [product])
}
