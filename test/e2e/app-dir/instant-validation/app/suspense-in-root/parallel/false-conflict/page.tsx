import { cookies } from 'next/headers'

export const unstable_instant = false

export default async function ChildrenPage() {
  await cookies()
  return (
    <main>
      <p>
        This is the children page with unstable_instant = false, allowing it to
        block
      </p>
    </main>
  )
}
