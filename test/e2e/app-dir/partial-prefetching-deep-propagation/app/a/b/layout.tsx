import { ReactNode } from 'react'

export default function BLayout({ children }: { children: ReactNode }) {
  return (
    <div data-layout="b">
      <div id="b-layout">B layout</div>
      {children}
    </div>
  )
}
