'use client'

import { useRouter } from 'next/navigation'
import { Button as NotFoundButton } from './button/not-found-button'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <NotFoundButton
        id="nav-button"
        onClick={() => {
          router.push('/navigate/404')
        }}
      >
        Not Found
      </NotFoundButton>
    </>
  )
}
