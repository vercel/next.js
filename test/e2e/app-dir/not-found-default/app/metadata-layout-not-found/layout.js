import { notFound } from 'next/navigation'

export async function generateMetadata() {
  notFound()
}

export default function layout({ children }) {
  return children
}
