import { notFound } from 'next/navigation'

export const instant = false

export function generateStaticParams() {
  return [{ slug: 'not-found' }]
}

export const metadata = { title: 'original page title' }

export default function Page() {
  return notFound()
}
