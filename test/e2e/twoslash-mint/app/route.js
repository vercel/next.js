import { serialize } from '@mintlify/mdx'

export async function GET() {
  const data = `
\`\`\`ts mint-twoslash
type X = Promise<number>
\`\`\`
`

  const mdxSource = await serialize({ source: data })

  return Response.json(mdxSource)
}
