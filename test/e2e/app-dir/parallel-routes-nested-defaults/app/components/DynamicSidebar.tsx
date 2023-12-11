import Link from 'next/link'

export function DynamicSidebar({ prefix }: { prefix: string }) {
  const links = []
  for (let i = 0; i < 200; i++) {
    links.push(
      <li key={i}>
        <Link href={`/${prefix}/${i}`}>Link {i}</Link>
      </li>
    )
  }

  return (
    <div>
      <ul>{links}</ul>
    </div>
  )
}
