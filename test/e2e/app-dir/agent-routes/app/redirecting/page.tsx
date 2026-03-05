import { redirect } from 'next/navigation'

export const agent = 'all'

export default function RedirectingPage() {
  redirect('/docs')
}
