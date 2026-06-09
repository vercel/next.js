import { ReactNode } from 'react'

export const unstable_instant = {
  unstable_samples: [{ cookies: [{ name: 'test', value: null }] }],
}
export const prefetch = 'allow-runtime'

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
