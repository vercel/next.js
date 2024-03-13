import { forbidden } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Page({ params }) {
  if (params.id === '403') {
    forbidden()
  }

  return <p>{`group-dynamic [id]`}</p>
}
