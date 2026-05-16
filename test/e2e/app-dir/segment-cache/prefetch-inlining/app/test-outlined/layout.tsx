import { ReactNode } from 'react'
import { NoInline } from '../../components/no-inline'

export default function LargeLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <NoInline />
      {children}
    </div>
  )
}
