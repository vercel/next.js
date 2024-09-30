import { notFound } from 'next/navigation'

export interface Props {
  params: Promise<{
    slug: string
  }>
}

const Article = async ({ params }: Props) => {
  const { slug } = await params

  if (slug !== 'works') {
    return notFound()
  }
  return <div>Articles page with slug</div>
}

export const revalidate = 1
export const dynamicParams = true

export async function generateStaticParams() {
  return [
    {
      slug: 'works', // Anything not this should be a 404 with no ISR
    },
  ]
}

export default Article
