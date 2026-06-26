import { notFound } from 'next/navigation'

export default async function Home() {
  notFound()
}

export const dynamic = 'force-dynamic'
