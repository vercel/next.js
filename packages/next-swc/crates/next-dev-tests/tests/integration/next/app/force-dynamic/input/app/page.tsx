import Test from './test'

export const dynamic = 'force-dynamic'

export default function Page({ searchParams }) {
  return (
    <div>
      <h1>{JSON.stringify(searchParams)}</h1>
      <Test />
    </div>
  )
}
