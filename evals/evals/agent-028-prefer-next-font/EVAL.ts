/**
 * Prefer Next.js Font
 *
 * Tests whether the agent uses next/font/google for font loading instead of
 * external CDN links or CSS @import.
 *
 * Tricky because agents reach for Google Fonts CDN links or CSS imports
 * instead of the zero-layout-shift next/font approach.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

test('BlogHeader uses Next.js fonts correctly', () => {
  const blogHeaderContent = readFileSync(
    join(process.cwd(), 'app', 'BlogHeader.tsx'),
    'utf-8'
  )

  // Should import fonts from next/font/google
  expect(blogHeaderContent).toMatch(/import.*from ['"]next\/font\/google['"]/)

  // Should import Playfair_Display and Roboto
  expect(blogHeaderContent).toMatch(/Playfair_Display/)
  expect(blogHeaderContent).toMatch(/Roboto/)

  // Should use .className to apply fonts
  expect(blogHeaderContent).toMatch(/className.*\.className/)

  // Should NOT use external CSS links or font-family styles
  expect(blogHeaderContent).not.toMatch(/@import|font-family|link.*font/)
})

test('BlogHeader has font configuration', () => {
  const blogHeaderContent = readFileSync(
    join(process.cwd(), 'app', 'BlogHeader.tsx'),
    'utf-8'
  )

  // Should configure fonts with subsets
  expect(blogHeaderContent).toMatch(/subsets.*latin/)

  // Should create font instances
  expect(blogHeaderContent).toMatch(/const.*=.*\(/)

  // Should apply different fonts to different elements
  expect(blogHeaderContent).toMatch(/className.*playfair/i)
  expect(blogHeaderContent).toMatch(/className.*roboto/i)
})
