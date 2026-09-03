import type { ReactNode } from 'react'
import { connection } from 'next/server'

export const metadata = {
  title: {
    default: 'conditional layout title',
    template: '[%s]',
  },
}

export default async function Layout({
  children,
}: {
  children: ReactNode
  error: ReactNode
  imageError: ReactNode
  login: ReactNode
  viewportError: ReactNode
}) {
  // This route intentionally contains a regular metadata error in an
  // unrendered slot. Keep it request-rendered so the production build can
  // exercise the outlet behavior at request time.
  await connection()
  return children
}
