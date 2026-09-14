import { notFound } from 'next/navigation'

function Inner() {
  notFound()
  return null
}

export default function Page() {
  return (
    <div>
      <Inner />
    </div>
  )
}
