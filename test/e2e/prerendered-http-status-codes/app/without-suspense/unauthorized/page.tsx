import { unauthorized } from 'next/navigation'

export default async function Page() {
  return unauthorized()
}
