import { notFound } from 'next/navigation'

export const agent = 'all'

export default function MissingPage() {
  notFound()
}
