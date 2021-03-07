import remark from 'remark'
import html from 'remark-html'
import hljs from "remark-highlight.js"

export default async function markdownToHtml(markdown: string) {
  const result = await remark().use(hljs).use(html).process(markdown)
  return result.toString()
}
