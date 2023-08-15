'use client'

import { useRouter } from 'next/navigation'
import { Button } from '../components/button/button'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <Button
        id="nav-button"
        onClick={() => {
          router.push('/404')
        }}
      >
        Not Found
      </Button>
    </>
  )
}
