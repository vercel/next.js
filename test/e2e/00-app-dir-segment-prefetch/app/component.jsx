import { Suspense } from 'react'
import { connection } from 'next/server'
import Link from 'next/link'

async function DynamicComponent() {
  await connection()
  return <div>Dynamic Component</div>
}

const links = [
  {
    href: '/',
    label: 'Home',
  },
  {
    href: '/blog/hello-world',
    label: 'Hello World',
  },
  {
    href: '/blog/hello-not-prerendered',
    label: 'Hello Not Prerendered',
  },
]

export function Component() {
  return (
    <main>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicComponent />
      </Suspense>
    </main>
  )
}
