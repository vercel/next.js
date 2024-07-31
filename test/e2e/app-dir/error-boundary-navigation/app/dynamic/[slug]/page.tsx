import { notFound, forbidden } from 'next/navigation'

export default function DynamicPage({ params }) {
  if (params.slug === '404') {
    notFound()
  }

  if (params.slug === '403') {
    forbidden()
  }

  return <p id="dynamic">Dynamic page: {params.slug}</p>
}
