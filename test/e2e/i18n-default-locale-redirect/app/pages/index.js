import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <div>
        <Link href="/to-new" id="to-new">
          To new (Default Locale)
        </Link>
      </div>
      <div>
        <Link href="/to-new" id="to-new-nl" locale="nl">
          To new (NL)
        </Link>
      </div>
    </div>
  )
}
