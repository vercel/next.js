import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Page({ params }) {
  if (params.id === '404') {
    notFound()
  }

  return <p>{`group-dynamic [id]`}</p>
}
