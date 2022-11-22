import { useRouter } from 'next/router'

export default function Component() {
  const router = useRouter()
  return (
    <>
      <p id="router-locale">{router.locale}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
    </>
  )
}
