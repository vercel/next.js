import Link from 'next/link'
import { useRouter } from 'next/router'

export async function getServerSideProps({ query }) {
  return {
    props: { href: decodeURI(query.href) || '/' },
  }
}

export default function ExternalLinker({ href }) {
  const router = useRouter()
  const pushRoute = () => {
    router.push(href)
  }
  return (
    <div>
      <Link href={href} id="link">
        link to{href}
      </Link>
      <button id="route-pusher" onClick={pushRoute}>
        push route {href}
      </button>
    </div>
  )
}
