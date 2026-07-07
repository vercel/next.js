import { cookies } from 'next/headers'

export default async function Page() {
  await cookies()
  return <p>optional catchall breadcrumbs dynamic page</p>
}
