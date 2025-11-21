import Link from 'next/link'

export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <Link href="/dynamic/first/second">To inner dynamic</Link>
      <p id={`dynamic-${params.first}`}>dynamic {params.first}</p>
    </>
  )
}
