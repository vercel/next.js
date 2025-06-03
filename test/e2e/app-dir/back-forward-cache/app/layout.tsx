import Link from 'next/link'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const links = []
  for (let n = 1; n <= 5; n++) {
    links.push(
      <li key={n}>
        <Link href={`/page/${n}`}>Page {n}</Link>
      </li>
    )
    links.push(
      <li key={n + '-with-search-param'}>
        <Link href={`/page/${n}?param=true`}>Page {n} (with search param)</Link>
      </li>
    )
  }
  return (
    <html lang="en">
      <body>
        <ul>{links}</ul>
        <div>{children}</div>
      </body>
    </html>
  )
}
