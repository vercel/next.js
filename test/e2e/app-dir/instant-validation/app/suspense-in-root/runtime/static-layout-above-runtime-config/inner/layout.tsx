import { ReactNode } from 'react'

// This layout has the runtime prefetch config. The developer expects
// runtime prefetching to handle dynamic data, but the parent layout
// above this one gets static prefetching by default and blocks.
export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}
export const unstable_prefetch = 'runtime'

export default function InnerLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>Inner layout with runtime prefetch config</em>
      {children}
    </div>
  )
}
