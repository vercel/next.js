import Link from 'next/link'

export default function Layout(props: {
  slot: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <ul>
        <li>
          <Link href="/vercel/sub/folder">/vercel/sub/folder</Link>
        </li>
        <li>
          <Link href="/vercel/sub/other-folder">/vercel/sub/other-folder</Link>
        </li>
      </ul>
      <div data-slot>{props.slot}</div>
      <div data-children>{props.children}</div>
    </div>
  )
}
