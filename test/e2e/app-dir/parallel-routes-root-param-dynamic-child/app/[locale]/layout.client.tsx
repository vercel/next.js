'use client'

import Link from 'next/link'
import { useState } from 'react'

type RouteInfo = {
  href: string
  status: '200' | '404'
}

type RouteSection = {
  title: string
  columns: string[]
  routes: RouteInfo[]
}

const ROUTE_SECTIONS: RouteSection[] = [
  {
    title: 'Base Routes',
    columns: ['Route', 'Expected Status'],
    routes: [
      { href: '/en', status: '200' },
      { href: '/fr', status: '200' },
      { href: '/es', status: '404' },
    ],
  },
  {
    title: 'Without generateStaticParams',
    columns: ['Route', 'Expected Status'],
    routes: [
      { href: '/en/no-gsp/stories/dynamic-123', status: '200' },
      { href: '/fr/no-gsp/stories/dynamic-123', status: '200' },
      { href: '/es/no-gsp/stories/dynamic-123', status: '200' },
    ],
  },
  {
    title: 'With generateStaticParams',
    columns: ['Route', 'Expected Status'],
    routes: [
      {
        href: '/en/gsp/stories/static-123',
        status: '200',
      },
      {
        href: '/fr/gsp/stories/static-123',
        status: '200',
      },
      {
        href: '/es/gsp/stories/static-123',
        status: '404',
      },
      {
        href: '/en/gsp/stories/dynamic-123',
        status: '404',
      },
      {
        href: '/fr/gsp/stories/dynamic-123',
        status: '404',
      },
      {
        href: '/es/gsp/stories/dynamic-123',
        status: '404',
      },
    ],
  },
]

function NavLink({ href, status }: { href: string; status: '200' | '404' }) {
  return (
    <Link
      href={href}
      className={`font-mono text-xs hover:underline ${status === '200' ? 'text-green-700' : 'text-red-700'}`}
    >
      {href}
    </Link>
  )
}

function StatusBadge({ status }: { status: '200' | '404' }) {
  return (
    <span
      className={`inline-block px-1 py-0 rounded text-xs ${status === '200' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
    >
      {status}
    </span>
  )
}

function RouteTable({ section }: { section: RouteSection }) {
  return (
    <div>
      <h2 className="text-sm font-bold mb-1">{section.title}</h2>
      <table className="w-full border-collapse border border-gray-300 text-xs">
        <thead>
          <tr className="bg-gray-100">
            {section.columns.map((column) => (
              <th
                key={column}
                className="border border-gray-300 px-2 py-0.5 text-left w-1/2"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.routes.map((route) => (
            <tr key={route.href}>
              <td className="border border-gray-300 px-2 py-0.5">
                <NavLink href={route.href} status={route.status} />
              </td>
              <td className="border border-gray-300 px-2 py-0.5">
                <StatusBadge status={route.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Navigation() {
  const [revealed, setRevealed] = useState(false)

  return (
    <>
      <input
        id="reveal"
        type="checkbox"
        checked={revealed}
        onChange={() => setRevealed(!revealed)}
      />
      {revealed && (
        <nav id="nav" className="space-y-2">
          {ROUTE_SECTIONS.map((section) => (
            <RouteTable key={section.title} section={section} />
          ))}
        </nav>
      )}
    </>
  )
}
