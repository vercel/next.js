import type { Metadata } from 'next'
import { connection } from 'next/server'

export const experimental_ppr = true

export const generateMetadata = async ({ params }): Promise<Metadata> => {
  const { slug } = await params
  return { title: `${slug}` }
}

export default async function Page() {
  await connection()
  return <p>Page</p>
}
