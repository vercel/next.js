import { notFound } from 'next/navigation'

export function generateMetadata() {
  notFound()
}

export default function Page() {
  return <h1>Hello from Page</h1>
}
