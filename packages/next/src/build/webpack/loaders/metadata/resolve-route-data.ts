import type {
  RobotsFile,
  SitemapFile,
} from '../../../../lib/metadata/types/metadata-interface'
import { resolveAsArrayOrUndefined } from '../../../../lib/metadata/generate/utils'

// convert robots data to txt string
export function resolveRobots(data: RobotsFile): string {
  let content = ''
  const rules = Array.isArray(data.rules) ? data.rules : [data.rules]
  for (const rule of rules) {
    const userAgent = resolveAsArrayOrUndefined(rule.userAgent) || ['*']
    for (const agent of userAgent) {
      content += `User-Agent: ${agent}\n`
    }
    if (rule.allow) {
      content += `Allow: ${rule.allow}\n`
    }
    if (rule.disallow) {
      content += `Disallow: ${rule.disallow}\n`
    }
    if (rule.crawlDelay) {
      content += `Crawl-delay: ${rule.crawlDelay}\n`
    }
    content += '\n'
  }
  if (data.host) {
    content += `Host: ${data.host}\n`
  }
  const sitemap = resolveAsArrayOrUndefined(data.sitemap)
  if (sitemap) {
    // TODO-METADATA: support injecting sitemap url into robots.txt
    sitemap.forEach((item) => {
      content += `Sitemap: ${item}\n`
    })
  }

  return content
}

// TODO-METADATA: support multi sitemap files
// convert sitemap data to xml string
export function resolveSitemap(data: SitemapFile): string {
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

export function resolveRouteData(
  data: RobotsFile | SitemapFile,
  baseName: 'robots' | 'sitemap'
): string {
  if (baseName === 'robots') {
    return resolveRobots(data as RobotsFile)
  }
  if (baseName === 'sitemap') {
    return resolveSitemap(data as SitemapFile)
  }
  return ''
}
