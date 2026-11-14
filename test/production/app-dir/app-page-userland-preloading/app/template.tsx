import type { ReactNode } from 'react'

console.log('page-preload:template-loaded')

export default function Template({ children }: { children: ReactNode }) {
  return children
}
