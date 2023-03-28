import type {
  Robots,
  Sitemap,
} from '../../../../lib/metadata/types/metadata-interface'
import type { Manifest } from '../../../../lib/metadata/types/manifest-types'
import { resolveArray } from '../../../../lib/metadata/generate/utils'

// convert robots data to txt string
export function resolveRobots(data: Robots): string {
  let content = ''
  const rules = Array.isArray(data.rules) ? data.rules : [data.rules]
  for (const rule of rules) {
    const userAgent = resolveArray(rule.userAgent || ['*'])
    for (const agent of userAgent) {
      content += `User-Agent: ${agent}\n`
    }
    if (rule.allow) {
      const allow = resolveArray(rule.allow)
      for (const item of allow) {
        content += `Allow: ${item}\n`
      }
    }
    if (rule.disallow) {
      const disallow = resolveArray(rule.disallow)
      for (const item of disallow) {
        content += `Disallow: ${item}\n`
      }
    }
    if (rule.crawlDelay) {
      content += `Crawl-delay: ${rule.crawlDelay}\n`
    }
    content += '\n'
  }
  if (data.host) {
    content += `Host: ${data.host}\n`
  }
  if (data.sitemap) {
    const sitemap = resolveArray(data.sitemap)
    // TODO-METADATA: support injecting sitemap url into robots.txt
    sitemap.forEach((item) => {
      content += `Sitemap: ${item}\n`
    })
  }

  return content
}

// TODO-METADATA: support multi sitemap files
// convert sitemap data to xml string
export function resolveSitemap(data: Sitemap): string {
  let content = ''
  content += '<?xml version="1.0" encoding="UTF-8"?>\n'
  content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  for (const item of data) {
    content += '<url>\n'
    content += `<loc>${item.url}</loc>\n`
    if (item.lastModified) {
      content += `<lastmod>${
        item.lastModified instanceof Date
          ? item.lastModified.toISOString()
          : item.lastModified
      }</lastmod>\n`
    }
    content += '</url>\n'
  }
  content += '</urlset>\n'
  return content
}

export function resolveManifest(data: Manifest): string {
  return JSON.stringify(data)
}

export function resolveRouteData(
  data: Robots | Sitemap | Manifest,
  fileType: 'robots' | 'sitemap' | 'manifest'
): string {
  if (fileType === 'robots') {
    return resolveRobots(data as Robots)
  }
  if (fileType === 'sitemap') {
    return resolveSitemap(data as Sitemap)
  }
  if (fileType === 'manifest') {
    return resolveManifest(data as Manifest)
  }
  return ''
}
