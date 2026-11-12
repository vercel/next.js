import Link from 'next/link'

// All of these links share the `[...slug]` route. `/old/a` and `/old/b` are
// legacy paths whose page calls `redirect()` to their new location.
const links = ['/docs/one', '/docs/two', '/docs/three', '/old/a', '/old/b']

export default function Page() {
  return (
    <ul>
      {links.map((href) => (
        <li key={href}>
          <Link href={href}>{href}</Link>
        </li>
      ))}
    </ul>
  )
}
