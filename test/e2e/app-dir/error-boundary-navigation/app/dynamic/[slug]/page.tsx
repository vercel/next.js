import { notFound } from 'next/navigation'

export default function DynamicPage({ params }) {
  if (params.slug === '404') {
    notFound()
  }

  return <p id="dynamic">Dynamic page: {params.slug}</p>
}
