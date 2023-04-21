'use client'

import type React from 'react'
import { useEffect } from 'react'

export default function Test(): React.ReactElement | null {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => {
      it('should have the correct title set', () => {
        expect(document.title).toBe('Page(slug_name) - RootLayout')
        let iconMeta = document.querySelector('link[rel=icon]')
        expect(iconMeta).toHaveProperty('href')
        expect(iconMeta.href).toMatch(/\/_next\/static\/assets/)
        let ogImageMeta = document.querySelector("meta[property='og:image']")
        expect(ogImageMeta).toHaveProperty('content')
        expect(ogImageMeta.content).toMatch(/\/_next\/static\/assets/)
      })
    })
    return () => {}
  }, [])
  return null
}
