import { notFound } from 'next/navigation'

export function generateMetadata() {
  notFound()
}

export function generateViewport() {
  notFound()
}

export default function Page() {
  return <div id="unrendered-not-found-page">unrendered not found page</div>
}
