import { permanentRedirect } from 'next/navigation'

export const revalidate = 1

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

export default function Page() {
  permanentRedirect('/destination')
}
