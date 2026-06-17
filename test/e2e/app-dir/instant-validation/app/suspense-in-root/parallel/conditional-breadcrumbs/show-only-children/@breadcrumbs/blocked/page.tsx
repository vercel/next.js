import { cookies } from 'next/headers'
export default async function BreadcrumbsPage() {
  await cookies()
  return <nav>breadcrumbs (calls cookies)</nav>
}
