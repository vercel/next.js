import { cookies } from 'next/headers'

export default async function Page() {
  const c = await cookies()
  const shouldFail = c.get('force-error')?.value === 'true'

  if (shouldFail) {
    throw new Error('Server Error Forced')
  }

  return <div id="success">Content Loaded Successfully</div>
}
