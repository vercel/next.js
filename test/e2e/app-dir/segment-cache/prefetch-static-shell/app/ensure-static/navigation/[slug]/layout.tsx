import { ReactNode } from 'react'
import { NoInline } from '../../../../components/no-inline'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <h2>Layout for page with a slug</h2>
      <NoInline />
      <hr />
      {children}
    </>
  )
}
