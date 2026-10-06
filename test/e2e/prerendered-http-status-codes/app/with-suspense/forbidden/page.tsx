import { forbidden } from 'next/navigation'

export default async function Page() {
  return forbidden()
}
