export default function Page({ searchParams }) {
  return <p>{searchParams.get('foo')}</p>
}

export const dynamic = 'error'
