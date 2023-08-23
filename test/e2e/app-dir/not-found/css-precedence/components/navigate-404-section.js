'use client'

import { Button } from './button/button'
import { useRouter } from 'next/navigation'

export default function Navigate404Section() {
  const router = useRouter()
  return (
    <p>
      <Button
        id="go-to-navigate-404"
        onClick={() => {
          router.push('/navigate-404')
        }}
      >
        Go to /navigate-404
      </Button>
    </p>
  )
}
