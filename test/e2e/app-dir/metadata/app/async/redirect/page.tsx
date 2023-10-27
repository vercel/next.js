import { redirect } from 'next/navigation'

export default function page() {
  return 'redirect to basic'
}

export async function generateMetadata() {
  redirect('/basic')
}
