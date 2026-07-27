import { notFound } from 'next/navigation'

export function generateMetadata() {
  notFound()
}

export default function Page() {
  return <div>@bar slot</div>
}
