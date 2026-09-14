import { cookies } from 'next/headers'

export default async function ChildrenPage() {
  await cookies()
  return (
    <main>
      <p>This is the children page that awaits cookies() without Suspense</p>
    </main>
  )
}
