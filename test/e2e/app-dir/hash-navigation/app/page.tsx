import Link from 'next/link'

export default function Page() {
  return (
    <div style={{ paddingTop: '100px' }}>
      <Link href="#section" id="link">
        Go to section
      </Link>

      <div style={{ marginTop: '15000px' }} id="section">
        <h1 style={{ color: 'black' }}>Section</h1>
      </div>
    </div>
  )
}
