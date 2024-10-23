import { connection } from 'next/server'

export default async function DynamicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO: This is a workaround for Turbopack. Figure out why this fails during
  // prerendering with:
  // TypeError: Cannot read properties of undefined (reading 'Form')
  await connection()

  return children
}
