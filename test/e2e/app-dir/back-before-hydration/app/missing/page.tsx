import { notFound } from 'next/navigation'

export default function Missing(): never {
  notFound()
}
