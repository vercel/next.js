import { notFound } from 'next/navigation'

export default function Page() {
  notFound()

  return <p>This will never render</p>
}
