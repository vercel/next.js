import type { ReactNode } from 'react'

export const experimental_paramMatching = {
  lang: 'not-found',
} as const

export default function LangLayout({ children }: { children: ReactNode }) {
  return children
}
