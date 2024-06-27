import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/')
}

export const dynamic = 'force-static'
