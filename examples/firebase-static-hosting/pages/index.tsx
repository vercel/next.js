import { useRouter } from 'next/router'
import Loader from '../components/loader'
import { useEffect } from 'react'

/**
 * To support dynamic routing...
 * Rewrite rule only helps to load index.html for any path. Once here, we need to handle routing to display appropriate component
 *
 * If you are not using dynamic routes, you can safely move contents of pages/home.tsx to this file.
 */
export default function IndexPage() {
  const router = useRouter()
  useEffect(() => {
    if (location.pathname === '/') {
      /** our landing page lives at /home. */
      router.push('/home')
    } else {
      router.push(location.pathname)
    }
  }, [router])
  return (
    <div>
      Redirecting...
      <Loader />
    </div>
  )
}
