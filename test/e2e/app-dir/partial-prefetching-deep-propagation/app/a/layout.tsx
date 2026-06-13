import { ReactNode } from 'react'

export default function ALayout({ children }: { children: ReactNode }) {
  return (
    <div data-layout="a">
      <div id="a-layout">A layout</div>
      {children}
    </div>
  )
}
