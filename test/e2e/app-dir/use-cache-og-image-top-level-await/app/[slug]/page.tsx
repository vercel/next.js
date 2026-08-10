import { readFile } from 'fs/promises'

async function getPostFile(slug: string) {
  'use cache'
  return readFile('./posts/' + slug + '.txt', 'utf8')
}

async function PostContent({ slug }: { slug: string }) {
  'use cache'
  const file = await getPostFile(slug)
  return <article>{file.trim()}</article>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <PostContent slug={slug} />
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const file = await getPostFile(slug)
  return { title: file.trim() }
}

export async function generateStaticParams() {
  return [{ slug: 'first-post' }, { slug: 'second-post' }]
}
