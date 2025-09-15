// @ts-nocheck - On isolated test, this will be a type error.
import type { Playwright } from '../../../lib/next-webdriver'

async function getMetadataLinks(browser: Playwright) {
  const links = await browser.locator('link').evaluateAll((elements: any[]) => {
    return elements
      .filter((el) => {
        if (el.href.includes('/_next/static')) {
          return false
        }

        return [
          '/favicon.ico',
          '/manifest.json',
          '/manifest.webmanifest',
          // Below may have suffixes like /icon1.png, /icon2.png, etc.
          // Or has suffixes like /icon-xxxxxx.png, /icon-image-yyyyyy.jpg, etc.
          '/icon',
          '/apple-icon',
          '/opengraph-image',
          '/twitter-image',
        ].some((file) =>
          new URL(el.href, window.location.origin).pathname.includes(file)
        )
      })
      .map((el) => ({
        href: new URL(el.href, window.location.origin).pathname,
        rel: el.rel,
        ...(el.type && { type: el.type }),
      }))
      .sort((a, b) => a.href.localeCompare(b.href))
  })
  return links
}

async function getMetadataMetas(browser: Playwright) {
  const metas = await browser.locator('meta').evaluateAll((elements: any[]) => {
    return elements
      .filter((meta) => {
        if (!meta.name && !meta.hasAttribute('property')) {
          return false
        }

        const attr = meta.name || meta.getAttribute('property') || ''
        return [
          'og:',
          'twitter:',
          'viewport',
          'description',
          'keywords',
          'robots',
        ].some(
          (prefix) => attr.startsWith(prefix) || attr === prefix.slice(0, -1)
        )
      })
      .map((el) => ({
        ...(el.name && { name: el.name }),
        ...(el.hasAttribute('property') && {
          property: el.getAttribute('property'),
        }),
      }))
      .sort((a, b) => {
        if (a.name && !b.name) return -1
        if (!a.name && b.name) return 1
        return (a.name || a.property || '').localeCompare(
          b.name || b.property || ''
        )
      })
  })
  return metas
}

export async function getCommonMetadataHeadTags(browser: Playwright) {
  const [links, metas] = await Promise.all([
    getMetadataLinks(browser),
    getMetadataMetas(browser),
  ])

  return { links, metas }
}
