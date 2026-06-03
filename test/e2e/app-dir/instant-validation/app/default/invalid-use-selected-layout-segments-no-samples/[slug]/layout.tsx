import { BreadcrumbTrail } from './breadcrumb-trail'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <BreadcrumbTrail />
      {children}
    </div>
  )
}
