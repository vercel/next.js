import type { ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

process.on('unhandledRejection', (rej) => {
  console.log('unhandledRejection', rej)
  process.exit(1)
})

export const revalidate = 0

export default function Page() {
  return notFound()
}

export async function generateMetadata(_, __: ResolvingMetadata) {
  return notFound()
}
