'use client'

import { useRouter } from 'next/navigation'
import { Button } from '../components/button/button'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <Button
        id="go-to-404"
        onClick={() => {
          router.push('/404')
        }}
      >
        Not Found
      </Button>
    </>
  )
}
