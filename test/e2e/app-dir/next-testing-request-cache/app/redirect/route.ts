import { redirect } from 'next/navigation'

export function GET() {
  redirect('/?redirected=1')
}
