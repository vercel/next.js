import Link from 'next/link'

if (typeof window !== 'undefined') {
  // Manually disable browser scroll restoration
  window.history.scrollRestoration = 'manual'
}

const Page = () => {
  const link = (
    <Link href="/another">
      <a
        id="to-another"
        style={{
          marginLeft: 5000,
          width: 95000,
          display: 'block',
        }}
      >
        to another
      </a>
    </Link>
  )

  return (
    <>
      <div
        style={{
          width: 10000,
          height: 10000,
          background: 'orange',
        }}
      />
      {link}
      <div id="end-el">the end</div>
      <div
        style={{
          width: 10000,
          height: 10000,
          background: 'orange',
        }}
      />
    </>
  )
}

export default Page
