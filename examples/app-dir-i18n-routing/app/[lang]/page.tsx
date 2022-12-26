import { redirect } from 'next/navigation'

export default function Page() {
  // We redirect to this path and let our middleware prepend the correct locale
  redirect('/some/custom/path')
  return null
}
