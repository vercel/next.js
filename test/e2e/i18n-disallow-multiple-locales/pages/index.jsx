import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <div>
      <p id="page">index page</p>
      <p id="router-locale">{router.locale}</p>
    </div>
  )
}
