export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="bg-gray-800">
        <ul className="flex">
          <li className="mr-6">
            <Link href="/prefetch-auto-route-groups">
              <p className="text-white hover:text-gray-300">Dashboard</p>
            </Link>
          </li>
          <li className="mr-6">
            <Link href="/prefetch-auto-route-groups/sub/foo">
              <p className="text-white hover:text-gray-300">Foo</p>
            </Link>
          </li>
          <li className="mr-6">
            <Link href="/prefetch-auto-route-groups/sub/bar">
              <p className="text-white hover:text-gray-300">Bar</p>
            </Link>
          </li>
        </ul>
      </nav>
      {children}
    </>
  )
}
