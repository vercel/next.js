import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamicParams = false

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

export async function markdown({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<string> {
  const { slug } = await params
  // Records every call so tests can tell build-time from request-time calls.
  appendFileSync(join(process.cwd(), 'markdown-calls.log'), `${slug}\n`)
  return `# Post ${slug}\n`
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <h1>Post {slug}</h1>
}
