import { permanentRedirect } from 'next/navigation'

export default async function Page() {
  return permanentRedirect('/')
}
