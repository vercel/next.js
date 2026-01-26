import { headers } from 'next/headers'

export default async function Layout({ children }) {
  // Use headers() to opt into dynamic rendering
  await headers()
  return children
}
