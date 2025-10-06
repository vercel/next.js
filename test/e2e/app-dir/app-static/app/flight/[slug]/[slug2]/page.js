import { cookies } from 'next/headers'

import Refresh from './refresh'

export default async function Page() {
  const cookieValue = (await cookies()).get('test-cookie')
  return (
    <>
      <Refresh />
      <h1>{cookieValue?.value}</h1>
    </>
  )
}
