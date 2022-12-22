import { redirect } from 'next/navigation'

export default function Page() {
  // We redorect to this path and let our middleware to prepend correct locale
  redirect('/some/custom/path')
  return null
}
