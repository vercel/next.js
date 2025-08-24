import { forbidden } from 'next/navigation'

export async function generateMetadata() {
  forbidden()
}

export default function layout({ children }) {
  return children
}
