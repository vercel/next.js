import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  useEffect(() => {
    router.prefetch('/dynamic/[hello]')
    router.prefetch('/dynamic/[hello]')
    router.prefetch('/dynamic/[hello]')

    router.prefetch('/dynamic/first')
    router.prefetch('/dynamic/first')
    router.prefetch('/dynamic/first')
  }, [router])
  return (
    <div>
      <Link prefetch={true} href="/dynamic/[hello]" as={'/dynamic/test'}>
        <a>I should only be prefetched once</a>
      </Link>
    </div>
  )
}
