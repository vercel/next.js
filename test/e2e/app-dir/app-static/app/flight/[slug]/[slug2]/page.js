import { cookies } from 'next/headers'

import Refresh from './refresh'

export default function Page() {
  const cookieValue = cookies().get('test-cookie')
  return (
    <>
      <Refresh />
      <h1>{cookieValue?.value}</h1>
    </>
  )
}
