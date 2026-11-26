import { readFile } from 'fs/promises'
import { join } from 'path'

type Props = { params: Promise<{ slug: string }> }

async function getPost(slug: string): Promise<{ title: string; body: string }> {
  'use cache'
  return JSON.parse(
    await readFile(join(process.cwd(), 'posts', `${slug}.json`), 'utf8')
  )
}

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)
  return { title: post.title }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)
  return (
    <>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </>
  )
}
