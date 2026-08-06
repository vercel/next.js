import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return <div>Hello from pages dir! {router.query.param}</div>
}
