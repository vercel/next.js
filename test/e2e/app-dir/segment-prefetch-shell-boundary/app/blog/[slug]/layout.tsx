import { ReactNode } from 'react'

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h1 id="blog-layout-heading">Blog layout heading</h1>
      {children}
    </div>
  )
}
