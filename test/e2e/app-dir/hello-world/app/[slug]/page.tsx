import type { Metadata } from 'next'

export const experimental_ppr = true

export const generateMetadata = async ({ params }): Promise<Metadata> => {
  const { slug } = await params
  return { title: `${slug}` }
}

export default function Page() {
  return null
}
