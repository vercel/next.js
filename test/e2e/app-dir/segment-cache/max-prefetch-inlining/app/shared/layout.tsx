import { ReactNode } from 'react'
export default function SharedLayout({ children }: { children: ReactNode }) {
  return <div id="shared-layout">{children}</div>
}
