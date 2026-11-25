import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function PreviewPage() {
  const draft = (await cookies()).get('draft-title')?.value ?? 'Untitled draft'

  return (
    <main>
      <h1>Editor preview</h1>
      <p>{draft}</p>
    </main>
  )
}
