import { useRouter } from 'next/router'

export default function DynamicPage() {
  const router = useRouter()
  const { slug } = router.query

  return (
    <div>
      <h1>Dynamic Page</h1>
      <p id="dynamic-content">Slug: {slug}</p>
    </div>
  )
}
