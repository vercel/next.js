/**
 * Prefer Next.js Image
 *
 * Tests whether the agent uses the Next.js Image component from next/image
 * instead of plain HTML <img> tags.
 *
 * Tricky because agents default to <img> tags, missing Next.js automatic
 * image optimization, lazy loading, and responsive sizing.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

test('ProductGallery uses Next.js Image component', () => {
  const galleryContent = readFileSync(
    join(process.cwd(), 'app', 'ProductGallery.tsx'),
    'utf-8'
  )

  // Should import Image from next/image
  expect(galleryContent).toMatch(/import.*Image.*from ['"]next\/image['"]/)

  // Should use Image components, not img tags
  expect(galleryContent).toMatch(/<Image/)

  // Should NOT use img tags for product images
  expect(galleryContent).not.toMatch(/<img/)
})

test('ProductGallery has required image props', () => {
  const galleryContent = readFileSync(
    join(process.cwd(), 'app', 'ProductGallery.tsx'),
    'utf-8'
  )

  // Should have width and height props
  expect(galleryContent).toMatch(/width\s*=/)
  expect(galleryContent).toMatch(/height\s*=/)

  // Should have src prop using product imageUrl
  expect(galleryContent).toMatch(
    /src.*=.*product\.imageUrl|src.*=.*\{product\.imageUrl\}/
  )

  // Should have alt prop
  expect(galleryContent).toMatch(/alt.*=/)
})
