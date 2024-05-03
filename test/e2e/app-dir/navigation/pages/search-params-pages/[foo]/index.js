import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useEffect } from 'react'

export default function Page() {
  const params = useParams()
  const router = useRouter()
  const [count, setCount] = useState(0)
  useEffect(() => {
    console.log('params changed')
  }, [params])
  return (
    <div>
      <button
        id="rerender-button"
        onClick={() => setCount((count) => count + 1)}
      >
        Re-Render {count}
      </button>

      <button
        id="change-params-button"
        onClick={() => router.push('/search-params-pages/bar')}
      >
        Change Params
      </button>
    </div>
  )
}
