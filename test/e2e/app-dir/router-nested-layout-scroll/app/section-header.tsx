import Link from 'next/link'

export default function SectionHeader() {
  return (
    <header id="section-header">
      <h1 style={{ height: 80, margin: 0 }}>
        Section heading
        <Link id="to-other" href="/section/other">
          Other page
        </Link>
      </h1>
      <p style={{ height: 1200, margin: 0 }}>Section introduction</p>
    </header>
  )
}
