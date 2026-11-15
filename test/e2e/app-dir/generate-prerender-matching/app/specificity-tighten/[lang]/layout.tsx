import type { ReactNode } from 'react'

export const unstable_paramMatching = {
  lang: 'blocking',
} as const

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
