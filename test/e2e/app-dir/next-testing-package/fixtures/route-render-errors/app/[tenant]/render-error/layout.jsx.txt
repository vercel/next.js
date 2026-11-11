import { headers } from 'next/headers'

export default async function Layout({ children, params }) {
  const { tenant } = await params
  const requestHeaders = await headers()
  return (
    <main
      data-nested-layout={tenant}
      data-layout-header={requestHeaders.get('x-route-proof')}
    >
      {children}
    </main>
  )
}
