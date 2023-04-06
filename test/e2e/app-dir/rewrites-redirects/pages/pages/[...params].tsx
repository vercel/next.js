import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  const params = (router.query.params as string[]) || []

  return (
    <div id="page" className={`page_pages_${params.join('_')}`}>
      {params.join('/')}
    </div>
  )
}
