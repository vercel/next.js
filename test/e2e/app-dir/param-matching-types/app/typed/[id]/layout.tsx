import type { ParamMatching } from 'next'
import type { ReactNode } from 'react'

export const unstable_paramMatching = {
  id: 'blocking',
} satisfies ParamMatching

export default function Layout({ children }: { children: ReactNode }) {
  return <section>{children}</section>
}
