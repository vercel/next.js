import { ReactNode } from 'react'

export const unstable_instant = {
  unstable_samples: [{ cookies: [{ name: 'test', value: null }] }],
}
export const unstable_prefetch = 'force-runtime'

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
