import { useRouter } from 'next/router'
import { Debug } from '../components/debug'

export default function Page() {
  const router = useRouter()
  return <Debug page="/pages/about.js" pathname={`/${router.locale}/about`} />
}
