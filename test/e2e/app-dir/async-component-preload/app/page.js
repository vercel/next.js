import { redirect } from 'next/navigation'

export default async function Home() {
  redirect('success')
  return <h1>Home</h1>
}
