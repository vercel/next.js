import { notFound } from 'next/navigation'

export default function Dynamic({ params: { id } }) {
  if (id === '404') notFound()
  return <h1>dynamic</h1>
}
