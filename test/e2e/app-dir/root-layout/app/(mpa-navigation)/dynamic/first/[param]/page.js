import Link from 'next/link'

export default function Page({ params }) {
  return (
    <>
      <Link href="/dynamic/second/hello">To second dynamic</Link>
      <p id={`dynamic-${params.param}`}>dynamic {params.param}</p>
    </>
  )
}
