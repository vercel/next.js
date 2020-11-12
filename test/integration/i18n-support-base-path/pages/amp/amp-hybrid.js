import { useAmp } from 'next/amp'
import { useRouter } from 'next/router'

export const config = {
  amp: 'hybrid',
}

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="another">another page</p>
      <p id="is-amp">{useAmp() ? 'yes' : 'no'}</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
    </>
  )
}
