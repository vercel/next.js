import Link from 'next/link'

export default function Page({ params }) {
  return (
    <>
      <Link href="/basic-route/inner">To basic inner</Link>
      <p id={`dynamic-${params.first}-${params.second}`}>
        dynamic {params.first} {params.second}
      </p>
    </>
  )
}
