import { redirect } from 'next/navigation'

export default function Moved() {
  redirect('/gone')
}
