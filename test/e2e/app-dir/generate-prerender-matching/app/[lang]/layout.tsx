import type { ReactNode } from 'react'

export const unstable_matcher = {
  lang: 'not-found',
} as const

export default function LangLayout({ children }: { children: ReactNode }) {
  return children
}
