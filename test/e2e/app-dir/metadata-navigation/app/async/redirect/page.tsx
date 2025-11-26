import { redirect } from 'next/navigation'

export default function page() {
  return 'redirect page'
}

export async function generateMetadata() {
  redirect('/async/redirect/dest')
}
