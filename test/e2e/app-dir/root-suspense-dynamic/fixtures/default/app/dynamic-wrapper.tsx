import { headers } from 'next/headers'

export default async function DynamicWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  await headers()
  return <div>{children}</div>
}
