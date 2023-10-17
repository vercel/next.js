import { notFound } from 'next/navigation'

export default function Page({ params }) {
  if (params.id === '404') {
    notFound()
  }

  return <p id="page">{`group-dynamic [id]`}</p>
}
