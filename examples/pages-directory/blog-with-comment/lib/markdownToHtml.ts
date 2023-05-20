import type { VFileCompatible } from 'vfile'
import { remark } from 'remark'
import html from 'remark-html'

export default async function markdownToHtml(markdown: VFileCompatible) {
  const result = await remark().use(html).process(markdown)
  return result.toString()
}
