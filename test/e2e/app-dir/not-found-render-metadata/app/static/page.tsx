import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Discarded page title',
  description: 'Discarded description',
}

export default function Page() {
  notFound()
}
