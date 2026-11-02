import { redirect } from 'next/navigation'

export default function RedirPage() {
  redirect('/slow')
}
