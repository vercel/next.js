import { notFound } from 'next/navigation'

export default function page() {
  return 'not-found-text'
}

export async function generateMetadata() {
  notFound()
}
