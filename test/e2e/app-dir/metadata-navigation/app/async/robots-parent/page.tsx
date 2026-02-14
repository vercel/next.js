import { notFound } from 'next/navigation'

export default function Page() {
  return 'page'
}

export async function generateMetadata() {
  notFound()
}
