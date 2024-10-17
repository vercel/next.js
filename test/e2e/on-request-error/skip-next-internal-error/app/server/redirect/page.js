import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/another')
}

export const dynamic = 'force-dynamic'
