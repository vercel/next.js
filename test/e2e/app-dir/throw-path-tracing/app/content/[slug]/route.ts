import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function getContentDirectory(allowed: boolean) {
  if (allowed) {
    return join(process.cwd(), 'content')
  }
  throw new Error('Content is unavailable')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const directory = getContentDirectory(slug !== 'unavailable')
  const content = readFileSync(join(directory, `${slug}.mdx`), 'utf8')
  return new Response(content)
}
