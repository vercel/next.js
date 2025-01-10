import { redirect } from 'next/navigation'

export default async function Page() {
  // fake delay 1s to trigger loading state
  await new Promise((res) => setTimeout(res, 1000))

  redirect('/redirect/result')
}
