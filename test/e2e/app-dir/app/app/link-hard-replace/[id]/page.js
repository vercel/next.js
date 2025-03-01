import Link from 'next/link'
import { nanoid } from 'nanoid'

export default async function Page(props) {
  const params = await props.params
  const other = params.id === '123' ? '456' : '123'
  return (
    <>
      <h1 id={`render-id-${params.id}`}>{nanoid()}</h1>{' '}
      <Link href={`/link-hard-replace/${other}`} replace id="link">
        To{other}
      </Link>
    </>
  )
}
