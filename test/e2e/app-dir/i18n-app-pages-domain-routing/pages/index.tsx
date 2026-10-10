import { useRouter } from 'next/router'

export default function Page() {
  const { locale } = useRouter()

  return <p id="pages-locale">{locale}</p>
}
