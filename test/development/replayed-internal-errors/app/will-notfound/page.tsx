import { notFound } from 'next/navigation'

export default function Page() {
  console.error(new Error('This error should get replayed'))
  notFound() // ...and this one shouldn't
}
