import { ReactNode } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
