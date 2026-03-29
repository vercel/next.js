import { connection } from 'next/server'
import ErrorWrapper from '../client-component/catch-error-wrapper'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  // Force dynamic rendering so the client component is only SSR'd at
  // request time, never prerendered/statically generated at build time.
  await connection()
  return <ErrorWrapper title="client-catch-error-ssr">{children}</ErrorWrapper>
}
