import Link from 'next/link'

export default function Page({ params }) {
  return (
    <>
      <Link href="/basic-route/inner">To basic inner</Link>
      <p id={`dynamic-second-${params.param}`}>dynamic {params.param}</p>
    </>
  )
}
