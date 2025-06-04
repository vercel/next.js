import { unauthorized } from 'next/navigation'

export async function generateMetadata() {
  unauthorized()
}

export default function layout({ children }) {
  return children
}
