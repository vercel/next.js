import { ReactNode } from 'react'

export const instant = {
  unstable_samples: [{ cookies: [{ name: 'test', value: null }] }],
}
export const prefetch = 'partial'

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
