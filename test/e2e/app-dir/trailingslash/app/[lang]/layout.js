import Link from 'next/link'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'es' }]
}

export default function LangLayout({ children }) {
  return (
    <>
      <nav>
        <Link href="/en">English</Link> | <Link href="/es">Spanish</Link>
      </nav>
      <main>{children}</main>
    </>
  )
}
