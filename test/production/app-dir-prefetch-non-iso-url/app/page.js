import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="page">index</p>
      <p id="props">{JSON.stringify(props)}</p>
      <Link href="/iso-url" id="to-iso">
        /iso-url
      </Link>
      <br />
      <Link href="/кириллица" id="to-non-iso">
        /кириллица
      </Link>
      <br />
    </>
  )
}
