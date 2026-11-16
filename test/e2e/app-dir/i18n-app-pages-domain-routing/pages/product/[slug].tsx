import { useRouter } from 'next/router'

export default function Page() {
  const { locale } = useRouter()

  return <p id="product-locale">{locale}</p>
}
