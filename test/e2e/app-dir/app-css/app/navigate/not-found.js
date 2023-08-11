'use client'
import { Button } from './button/not-found-button'
import { useRouter } from 'next/navigation'

function NotFound() {
  const router = useRouter()
  return (
    <div>
      <h1>404 - Page Not Found</h1>
      <Button
        id="back"
        onClick={() => {
          router.push('/navigate')
        }}
      >
        Back
      </Button>
    </div>
  )
}

export default NotFound
