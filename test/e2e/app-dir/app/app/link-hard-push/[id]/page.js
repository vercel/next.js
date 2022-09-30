import Link from 'next/link'
import { nanoid } from 'nanoid'

export default function Page({ params }) {
  const other = params.id === '123' ? '456' : '123'
  return (
    <>
      <h1 id={`render-id-${params.id}`}>{nanoid()}</h1>{' '}
      <Link href={`/link-hard-push/${other}`}>
        <a id="link">To {other}</a>
      </Link>
    </>
  )
}
