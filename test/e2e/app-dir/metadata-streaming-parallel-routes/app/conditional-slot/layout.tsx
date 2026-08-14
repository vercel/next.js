import type { ReactNode } from 'react'

export const metadata = {
  title: {
    default: 'conditional layout title',
    template: '[%s]',
  },
}

// This route intentionally contains a regular metadata error in an unrendered
// slot. Keep it request-rendered so the production build can exercise the
// outlet behavior without treating that intentional error as a prerender
// failure.
export const dynamic = 'force-dynamic'

export default function Layout({
  children,
}: {
  children: ReactNode
  error: ReactNode
  imageError: ReactNode
  login: ReactNode
  viewportError: ReactNode
}) {
  return children
}
