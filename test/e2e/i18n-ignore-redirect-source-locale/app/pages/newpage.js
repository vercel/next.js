import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return <p id="current-locale">{router.locale}</p>
}
