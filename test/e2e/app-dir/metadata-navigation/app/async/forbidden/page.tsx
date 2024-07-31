import { forbidden } from 'next/navigation'

export default function page() {
  return 'forbidden-text'
}

export async function generateMetadata() {
  forbidden()
}
