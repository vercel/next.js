import { forbidden } from 'next/navigation'

export default function Page({ params }) {
  if (params.id === '403') {
    forbidden()
  }

  return <p id="page">{`group-dynamic [id]`}</p>
}
