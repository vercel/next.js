import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <p>/_sport/[slug]/test</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="as-path">{router.asPath}</p>
      <p id="pathname">{router.pathname}</p>
    </>
  )
}
