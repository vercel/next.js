import { ReactNode } from 'react'

export default function InnerLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>This is a URL-contributing layout with no config</em>
      <hr />
      {children}
    </div>
  )
}
