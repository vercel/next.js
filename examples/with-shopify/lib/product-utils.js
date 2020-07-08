import { useMemo } from 'react'

export const isSize = (option) => option.name === 'Size'

export const isColor = (option) => option.name === 'Color'

export const getSize = (node) => node.selectedOptions.find(isSize)?.value

export const getColor = (node) => node.selectedOptions.find(isColor)?.value

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

export function getVariantsMetadata(variants) {
  const colors = new Set()
  const colorsBySize = new Map()

  variants.forEach(({ node }) => {
    const size = getSize(node)
    const color = getColor(node)

    if (color) colors.add(color)
    if (size) {
      const sizeColors = colorsBySize.get(size) || []

      if (color) sizeColors.push(color)

      colorsBySize.set(size, sizeColors)
    }
  })

  return { colors, colorsBySize }
}
