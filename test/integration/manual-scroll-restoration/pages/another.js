import Link from 'next/link'

export default function Page() {
  const link = (
    <Link href="/">
      <a
        id="to-index"
        style={{
          marginLeft: 8000,
          width: 15000,
          display: 'block',
        }}
      >
        to index
      </a>
    </Link>
  )

  return (
    <>
      <div
        style={{
          width: 11000,
          height: 13000,
          background: 'orange',
        }}
      />
      {link}
      <div id="end-el">hi from another</div>
      <div
        style={{
          width: 11000,
          height: 13000,
          background: 'orange',
        }}
      />
    </>
  )
}
