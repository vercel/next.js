import type { ResolvingMetadata } from 'next'

export default function Page() {
  return null
}

export async function generateMetadata(_, __: ResolvingMetadata) {
  return {
    title: 'foo',
  }
}
