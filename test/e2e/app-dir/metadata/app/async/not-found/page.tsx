import { notFound } from 'next/navigation'

export default function page() {
  return 'not found'
}

export async function generateMetadata() {
  notFound()
}
