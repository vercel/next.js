import type { MetadataRoute } from '../../../../lib/metadata/types/metadata-interface'
import { resolveArray } from '../../../../lib/metadata/generate/utils'

/**
 * CC0 Content Signals Policy comment block.
 * @see https://contentsignals.org/
 * @see https://blog.cloudflare.com/content-signals-policy/
 */
export const CONTENT_SIGNALS_POLICY = `# As a condition of accessing this website, you agree to abide by the following content signals:
#
# (a)  If a content-signal = yes, you may collect content for the corresponding use.
# (b)  If a content-signal = no, you may not collect content for the corresponding use.
# (c)  If the website operator does not include a content signal for a corresponding use, the website operator neither grants nor restricts permission via content signal with respect to the corresponding use.
#
# The content signals and their meanings are:
#
# search: building a search index and providing search results (e.g., returning hyperlinks and short excerpts from your website's contents).  Search does not include providing AI-generated search summaries.
# ai-input: inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers).
# ai-train: training or fine-tuning AI models.
#
# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.
`

type ContentSignalInput = NonNullable<MetadataRoute.Robots['contentSignal']>

function formatContentSignalPairs(
  signal: MetadataRoute.ContentSignal
): string | null {
  const pairs: string[] = []
  if (typeof signal.search === 'boolean') {
    pairs.push(`search=${signal.search ? 'yes' : 'no'}`)
  }
  if (typeof signal.aiInput === 'boolean') {
    pairs.push(`ai-input=${signal.aiInput ? 'yes' : 'no'}`)
  }
  if (typeof signal.aiTrain === 'boolean') {
    pairs.push(`ai-train=${signal.aiTrain ? 'yes' : 'no'}`)
  }
  return pairs.length > 0 ? pairs.join(', ') : null
}

function resolveContentSignalPaths(
  path: MetadataRoute.ContentSignalRule['path']
): Array<string | undefined> {
  if (
    path == null ||
    path === '' ||
    (Array.isArray(path) && path.length === 0)
  ) {
    return [undefined]
  }
  // Holes / empty strings in a path list are skipped, not treated as site-wide.
  return resolveArray(path).filter((p) => typeof p === 'string' && p.length > 0)
}

export function resolveContentSignal(input: ContentSignalInput): string {
  const rules = Array.isArray(input) ? input : [input]
  let content = ''
  for (const rule of rules) {
    if (rule == null || typeof rule !== 'object') continue
    const pairs = formatContentSignalPairs(rule)
    if (!pairs) continue
    for (const path of resolveContentSignalPaths(rule.path)) {
      if (path) {
        content += `Content-Signal: ${path} ${pairs}\n`
      } else {
        content += `Content-Signal: ${pairs}\n`
      }
    }
  }
  return content
}

// convert robots data to txt string
export function resolveRobots(data: MetadataRoute.Robots): string {
  let content = ''
  if (data.contentSignalsPolicy) {
    content += CONTENT_SIGNALS_POLICY
    if (!content.endsWith('\n')) content += '\n'
    content += '\n'
  }
  const rules = Array.isArray(data.rules) ? data.rules : [data.rules]
  for (const rule of rules) {
    const userAgent = resolveArray(rule.userAgent || ['*'])
    for (const agent of userAgent) {
      content += `User-Agent: ${agent}\n`
    }
    const contentSignal =
      rule.contentSignal !== undefined
        ? rule.contentSignal
        : data.contentSignal
    if (contentSignal !== undefined) {
      content += resolveContentSignal(contentSignal)
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
    if (rule.other) {
      for (const key of Object.keys(rule.other)) {
        const value = rule.other[key]
        if (value == null) continue
        const values = Array.isArray(value) ? value : [value]
        for (const v of values) {
          content += `${key}: ${v}\n`
        }
      }
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
export function resolveSitemap(data: MetadataRoute.Sitemap): string {
  const hasAlternates = data.some(
    (item) => Object.keys(item.alternates ?? {}).length > 0
  )
  const hasImages = data.some((item) => Boolean(item.images?.length))
  const hasVideos = data.some((item) => Boolean(item.videos?.length))

  let content = ''
  content += '<?xml version="1.0" encoding="UTF-8"?>\n'
  content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
  if (hasImages) {
    content += ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
  }
  if (hasVideos) {
    content += ' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"'
  }
  if (hasAlternates) {
    content += ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  } else {
    content += '>\n'
  }
  for (const item of data) {
    content += '<url>\n'
    content += `<loc>${item.url}</loc>\n`

    const languages = item.alternates?.languages
    if (languages && Object.keys(languages).length) {
      // Since sitemap is separated from the page rendering, there's not metadataBase accessible yet.
      // we give the default setting that won't effect the languages resolving.
      for (const language in languages) {
        content += `<xhtml:link rel="alternate" hreflang="${language}" href="${
          languages[language as keyof typeof languages]
        }" />\n`
      }
    }
    if (item.images?.length) {
      for (const image of item.images) {
        content += `<image:image>\n<image:loc>${image}</image:loc>\n</image:image>\n`
      }
    }
    if (item.videos?.length) {
      for (const video of item.videos) {
        let videoFields = [
          `<video:video>`,
          `<video:title>${video.title}</video:title>`,
          `<video:thumbnail_loc>${video.thumbnail_loc}</video:thumbnail_loc>`,
          `<video:description>${video.description}</video:description>`,
          video.content_loc &&
            `<video:content_loc>${video.content_loc}</video:content_loc>`,
          video.player_loc &&
            `<video:player_loc>${video.player_loc}</video:player_loc>`,
          video.duration &&
            `<video:duration>${video.duration}</video:duration>`,
          video.view_count &&
            `<video:view_count>${video.view_count}</video:view_count>`,
          video.tag && `<video:tag>${video.tag}</video:tag>`,
          video.rating && `<video:rating>${video.rating}</video:rating>`,
          video.expiration_date &&
            `<video:expiration_date>${video.expiration_date}</video:expiration_date>`,
          video.publication_date &&
            `<video:publication_date>${video.publication_date}</video:publication_date>`,
          video.family_friendly &&
            `<video:family_friendly>${video.family_friendly}</video:family_friendly>`,
          video.requires_subscription &&
            `<video:requires_subscription>${video.requires_subscription}</video:requires_subscription>`,
          video.live && `<video:live>${video.live}</video:live>`,
          video.restriction &&
            `<video:restriction relationship="${video.restriction.relationship}">${video.restriction.content}</video:restriction>`,
          video.platform &&
            `<video:platform relationship="${video.platform.relationship}">${video.platform.content}</video:platform>`,
          video.uploader &&
            `<video:uploader${video.uploader.info && ` info="${video.uploader.info}"`}>${video.uploader.content}</video:uploader>`,
          `</video:video>\n`,
        ].filter(Boolean)
        content += videoFields.join('\n')
      }
    }
    if (item.lastModified) {
      const serializedDate =
        item.lastModified instanceof Date
          ? item.lastModified.toISOString()
          : item.lastModified

      content += `<lastmod>${serializedDate}</lastmod>\n`
    }

    if (item.changeFrequency) {
      content += `<changefreq>${item.changeFrequency}</changefreq>\n`
    }

    if (typeof item.priority === 'number') {
      content += `<priority>${item.priority}</priority>\n`
    }

    content += '</url>\n'
  }

  content += '</urlset>\n'

  return content
}

export function resolveManifest(data: MetadataRoute.Manifest): string {
  return JSON.stringify(data)
}

export function resolveRouteData(
  data: MetadataRoute.Robots | MetadataRoute.Sitemap | MetadataRoute.Manifest,
  fileType: 'robots' | 'sitemap' | 'manifest'
): string {
  if (fileType === 'robots') {
    return resolveRobots(data as MetadataRoute.Robots)
  }
  if (fileType === 'sitemap') {
    return resolveSitemap(data as MetadataRoute.Sitemap)
  }
  if (fileType === 'manifest') {
    return resolveManifest(data as MetadataRoute.Manifest)
  }
  return ''
}
